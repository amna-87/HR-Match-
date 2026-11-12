// Email templates. Every email: clear sender identity + unsubscribe link.
const appName = () => process.env.APP_NAME ?? "HireLoop";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string, unsubscribeUrl: string) {
  const name = escapeHtml(appName());
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-weight:700;font-size:18px;margin:0 0 16px">${name}</p>
<div style="background:#fff;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
${bodyHtml}
</div>
<p style="font-size:12px;color:#555;margin-top:16px;line-height:1.5">
You're receiving this because you have a ${name} candidate account with match emails turned on.
Nothing is ever sent to an employer without your approval.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#555">Unsubscribe from match emails</a> · Sent by ${name}.
</p></div></body></html>`;
}

const button = (href: string, label: string, primary: boolean) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;${
    primary ? "background:#111;color:#fff" : "background:#eef0f3;color:#111"
  }">${escapeHtml(label)}</a>`;

export interface MatchEmailItem {
  title: string;
  company: string;
  sourced: boolean;
  sourceName?: string | null;
  explanation: string;
  approveUrl?: string;
  declineUrl?: string;
  viewUrl?: string;
  expiresAt: Date;
}

export function matchDigestEmail(firstName: string | null, items: MatchEmailItem[], unsubscribeUrl: string) {
  const n = items.length;
  const subject = n === 1 ? `New match: ${items[0].title} at ${items[0].company}` : `${n} new job matches for you`;
  const greeting = `Hi${firstName ? ` ${firstName}` : ""},`;
  const intro =
    "We matched your profile to the role(s) below. Approve to send your profile to the employer, or decline. Nothing is shared until you approve.";
  const blocks = items.map((it) => {
    const label = it.sourced ? `<p style="font-size:12px;color:#8a5a00;margin:4px 0">Sourced from ${escapeHtml(it.sourceName ?? "an external listing")}. Apply via the original listing — this employer is not on ${escapeHtml(appName())}.</p>` : "";
    const actions = it.sourced
      ? button(it.viewUrl!, "View listing & how to apply", true)
      : `${button(it.approveUrl!, "Approve & apply", true)} &nbsp; ${button(it.declineUrl!, "Decline", false)}`;
    return `<div style="border-top:1px solid #eee;padding:16px 0">
<p style="font-weight:600;margin:0">${escapeHtml(it.title)} · ${escapeHtml(it.company)}</p>${label}
<p style="font-size:14px;color:#333;margin:8px 0">${escapeHtml(it.explanation)}</p>
<p style="margin:12px 0 4px">${actions}</p>
<p style="font-size:12px;color:#777;margin:4px 0">Links expire ${it.expiresAt.toUTCString().slice(0, 16)}.</p></div>`;
  });
  const html = layout(subject, `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(intro)}</p>${blocks.join("")}`, unsubscribeUrl);
  const text = [
    greeting,
    "",
    intro,
    "",
    ...items.flatMap((it) => [
      `* ${it.title} - ${it.company}${it.sourced ? ` (sourced from ${it.sourceName ?? "external listing"}; apply via the original listing)` : ""}`,
      `  ${it.explanation}`,
      it.sourced ? `  View: ${it.viewUrl}` : `  Approve: ${it.approveUrl}\n  Decline: ${it.declineUrl}`,
      "",
    ]),
    `Unsubscribe: ${unsubscribeUrl}`,
    `Sent by ${appName()}.`,
  ].join("\n");
  return { subject, html, text };
}

export function redistributionEmail(
  firstName: string | null,
  sourceLabel: string,
  jobTitle: string,
  domains: string[],
  strengths: string[],
  reviewUrl: string,
  unsubscribeUrl: string,
) {
  const who = sourceLabel === "a previous employer's recruiter" ? "A recruiter" : sourceLabel;
  const subject = `${who} flagged you as strong for ${domains.join(", ")}`;
  const body = `<p>Hi${firstName ? ` ${escapeHtml(firstName)}` : ""},</p>
<p>${escapeHtml(who)} reviewed you for <strong>${escapeHtml(jobTitle)}</strong>. They flagged you as strong for
<strong>${escapeHtml(domains.join(", "))}</strong>${strengths.length ? ` (strengths: ${escapeHtml(strengths.join(", "))})` : ""}.</p>
<p>Want to be visible to other recruiters hiring in these areas? You choose per area, and you can withdraw at any time.</p>
<p>${button(reviewUrl, "Review and choose", true)}</p>`;
  const text = `${who} reviewed you for ${jobTitle} and flagged you as strong for ${domains.join(", ")}.
Want to be visible to other recruiters hiring in these areas? Review: ${reviewUrl}
Unsubscribe: ${unsubscribeUrl}`;
  return { subject, html: layout(subject, body, unsubscribeUrl), text };
}
