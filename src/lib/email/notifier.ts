// Notify step (Section 8): suggested -> notified, with weekly throttling,
// frequency preferences, retries and delivery tracking.
//
// Rule: we only ever email the ACCOUNT email of a CLAIMED candidate
// (users.email), never an address extracted from a resume (candidates.contact_email).
import type { Queryable } from "@/lib/db";
import { MATCHING_CONFIG, NOTIFY_CONFIG } from "@/lib/matching/config";
import { signToken } from "@/lib/consent/tokens";
import { matchDigestEmail, redistributionEmail, type MatchEmailItem } from "./templates";
import { TransientEmailError, type EmailSender } from "./sender";

export interface NotifierDeps {
  db: Queryable;
  sender: EmailSender;
  appUrl?: string;
  now?: Date;
}

const appUrl = (d: NotifierDeps) => (d.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function unsubscribeUrls(d: NotifierDeps, candidateId: string, now = new Date()) {
  const exp = new Date(now.getTime() + 365 * 86400_000);
  const token = signToken("unsubscribe", candidateId, candidateId, exp);
  return {
    page: `${appUrl(d)}/unsubscribe/${token}`,
    oneClick: `${appUrl(d)}/api/unsubscribe?token=${encodeURIComponent(token)}`,
  };
}

interface Recipient {
  candidate_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  match_emails_enabled: boolean;
  match_email_frequency: "instant" | "daily" | "weekly";
  emails_last_week: number;
  last_email_at: Date | null;
}

/** Candidates eligible to be told about matches right now. */
async function recipientsWithPendingMatches(db: Queryable, threshold: number): Promise<Recipient[]> {
  const r = await db.query<Recipient>(
    `select c.id as candidate_id, u.id as user_id, u.email, c.full_name, c.match_emails_enabled, c.match_email_frequency,
            (select count(*)::int from public.notifications n
              where n.user_id = u.id and n.channel = 'email' and n.type = 'match_digest'
                and n.created_at > now() - interval '7 days' and n.delivery_status <> 'failed') as emails_last_week,
            (select max(n.created_at) from public.notifications n
              where n.user_id = u.id and n.channel = 'email' and n.type = 'match_digest' and n.delivery_status <> 'failed') as last_email_at
     from public.candidates c
     join public.users u on u.id = c.user_id
     where c.claim_status = 'claimed' and u.status = 'active' and c.open_to_work and not c.visibility_paused
       and exists (
         select 1 from public.matches m join public.jobs j on j.id = m.job_id
         where m.candidate_id = c.id and m.status = 'suggested' and m.score >= $1
           and j.status = 'published' and (j.expires_at is null or j.expires_at > now()))`,
    [threshold],
  );
  return r.rows;
}

function isThrottled(rc: Recipient, now: Date): boolean {
  if (!rc.match_emails_enabled) return false; // in-app only: no email to throttle
  if (rc.emails_last_week >= NOTIFY_CONFIG.maxEmailsPerWeek) return true;
  const gapH = NOTIFY_CONFIG.frequencyHours[rc.match_email_frequency] ?? 0;
  if (gapH > 0 && rc.last_email_at && now.getTime() - new Date(rc.last_email_at).getTime() < gapH * 3600_000) return true;
  return false;
}

export interface NotifierResult {
  candidatesNotified: number;
  matchesNotified: number;
  throttled: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function runNotifier(deps: NotifierDeps): Promise<NotifierResult> {
  const now = deps.now ?? new Date();
  const out: NotifierResult = { candidatesNotified: 0, matchesNotified: 0, throttled: 0, emailsSent: 0, emailsFailed: 0 };
  const recipients = await recipientsWithPendingMatches(deps.db, MATCHING_CONFIG.threshold);

  for (const rc of recipients) {
    if (isThrottled(rc, now)) {
      out.throttled++;
      continue; // stays 'suggested' and is picked up by a later run
    }
    const pending = await deps.db.query<{ id: string; title: string }>(
      `select m.id, j.title from public.matches m join public.jobs j on j.id = m.job_id
       where m.candidate_id = $1 and m.status = 'suggested' and m.score >= $2
         and j.status = 'published' and (j.expires_at is null or j.expires_at > now())
       order by m.score desc limit $3`,
      [rc.candidate_id, MATCHING_CONFIG.threshold, NOTIFY_CONFIG.maxMatchesPerEmail],
    );
    const notifiedIds: string[] = [];
    for (const m of pending.rows) {
      const ok = await deps.db.query<{ ok: boolean }>("select public.mark_match_notified($1, $2) as ok", [
        m.id,
        NOTIFY_CONFIG.matchExpiryDays,
      ]);
      if (!ok.rows[0]?.ok) continue;
      notifiedIds.push(m.id);
      await deps.db.query(
        `insert into public.notifications(user_id, type, channel, payload, delivery_status, sent_at)
         values ($1, 'match', 'in_app', $2::jsonb, 'sent', now())`,
        [rc.user_id, JSON.stringify({ match_id: m.id, job_title: m.title })],
      );
    }
    if (!notifiedIds.length) continue;
    out.candidatesNotified++;
    out.matchesNotified += notifiedIds.length;
    if (rc.match_emails_enabled) {
      await deps.db.query(
        `insert into public.notifications(user_id, type, channel, payload, delivery_status)
         values ($1, 'match_digest', 'email', $2::jsonb, 'pending')`,
        [rc.user_id, JSON.stringify({ match_ids: notifiedIds })],
      );
    }
  }

  const delivery = await deliverPendingEmails(deps);
  out.emailsSent = delivery.sent;
  out.emailsFailed = delivery.failed;
  return out;
}

interface PendingEmail {
  id: string;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Sends queued/failed email notifications (with retry + status tracking). */
export async function deliverPendingEmails(deps: NotifierDeps): Promise<{ sent: number; failed: number }> {
  const rows = await deps.db.query<PendingEmail>(
    `select id, user_id, type, payload, attempts from public.notifications
     where channel = 'email' and delivery_status in ('pending', 'failed') and attempts < $1
     order by created_at limit 200`,
    [NOTIFY_CONFIG.maxAttempts],
  );
  let sent = 0;
  let failed = 0;
  for (const n of rows.rows) {
    const rendered = await renderNotification(deps, n);
    if (!rendered) {
      await deps.db.query("update public.notifications set delivery_status = 'skipped', last_error = $2 where id = $1", [
        n.id,
        "nothing to send (unsubscribed, unclaimed, or matches no longer open)",
      ]);
      continue;
    }
    let attempts = n.attempts;
    let lastError: string | null = null;
    let result: { id: string | null; skipped?: boolean } | null = null;
    // retry transient failures with exponential backoff within this run
    while (attempts < NOTIFY_CONFIG.maxAttempts) {
      attempts++;
      try {
        result = await deps.sender.send(rendered);
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (!(e instanceof TransientEmailError)) {
          attempts = NOTIFY_CONFIG.maxAttempts;
          break;
        }
        if (attempts < NOTIFY_CONFIG.maxAttempts && !process.env.VITEST) {
          await new Promise((r) => setTimeout(r, 250 * 2 ** attempts));
        }
      }
    }
    if (result) {
      sent++;
      await deps.db.query(
        `update public.notifications set delivery_status = $2, sent_at = now(), attempts = $3, provider_message_id = $4, last_error = null
         where id = $1`,
        [n.id, result.skipped ? "skipped" : "sent", attempts, result.id],
      );
    } else {
      failed++;
      await deps.db.query("update public.notifications set delivery_status = 'failed', attempts = $2, last_error = $3 where id = $1", [
        n.id,
        attempts,
        lastError?.slice(0, 1000) ?? "unknown error",
      ]);
    }
  }
  return { sent, failed };
}

async function renderNotification(deps: NotifierDeps, n: PendingEmail) {
  // Recipient: account email of a claimed candidate with match emails on.
  const r = await deps.db.query<{ email: string; full_name: string | null; candidate_id: string; enabled: boolean }>(
    `select u.email, c.full_name, c.id as candidate_id, c.match_emails_enabled as enabled
     from public.users u join public.candidates c on c.user_id = u.id
     where u.id = $1 and u.status = 'active' and c.claim_status = 'claimed'`,
    [n.user_id],
  );
  const who = r.rows[0];
  if (!who || !who.enabled || !who.email) return null;
  const first = who.full_name?.split(/\s+/)[0] ?? null;
  const urls = unsubscribeUrls(deps, who.candidate_id);
  const unsub = urls.page;
  const headers = {
    "List-Unsubscribe": `<${urls.oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };

  if (n.type === "match_digest") {
    const ids = (n.payload.match_ids as string[]) ?? [];
    const m = await deps.db.query<{
      id: string;
      title: string;
      company: string | null;
      source_type: "verified" | "sourced";
      source_name: string | null;
      explanation: string;
      expires_at: Date;
    }>(
      `select m.id, j.title, coalesce(co.name, j.source_company_name, 'An employer') as company, j.source_type, j.source_name,
              m.explanation, m.expires_at
       from public.matches m join public.jobs j on j.id = m.job_id left join public.companies co on co.id = j.company_id
       where m.id = any($1::uuid[]) and m.candidate_id = $2 and m.status = 'notified'
       order by m.score desc`,
      [ids, who.candidate_id],
    );
    if (!m.rows.length) return null;
    const base = appUrl(deps);
    const items: MatchEmailItem[] = m.rows.map((row) => {
      const exp = new Date(row.expires_at);
      const t = (p: "match_approve" | "match_decline" | "match_view") =>
        `${base}/m/${signToken(p, row.id, who.candidate_id, exp)}`;
      return {
        title: row.title,
        company: row.company ?? "An employer",
        sourced: row.source_type === "sourced",
        sourceName: row.source_name,
        explanation: row.explanation,
        approveUrl: row.source_type === "verified" ? t("match_approve") : undefined,
        declineUrl: row.source_type === "verified" ? t("match_decline") : undefined,
        viewUrl: row.source_type === "sourced" ? t("match_view") : undefined,
        expiresAt: exp,
      };
    });
    return { to: who.email, headers, ...matchDigestEmail(first, items, unsub) };
  }

  if (n.type === "redistribution_offer") {
    const p = n.payload as { source_label: string; job_title: string; domains: string[]; strengths: string[] };
    return {
      to: who.email,
      headers,
      ...redistributionEmail(first, p.source_label, p.job_title, p.domains, p.strengths, `${appUrl(deps)}/candidate#visibility`, unsub),
    };
  }
  return null;
}
