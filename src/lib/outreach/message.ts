// Outreach messages (C2, D-031). Every message says who sent it and why, how to
// apply, and carries a one-click opt-out that stops ALL recruiter messages via
// Vouch for that address.
import { createHash } from "node:crypto";
import { signToken, verifyToken } from "@/lib/consent/tokens";
import { jobPath } from "@/lib/slug";

/** Same normalisation and hash as public.contact_hash() in the database. */
export function contactHash(contact: string | null | undefined): string | null {
  if (!contact || !contact.trim()) return null;
  if (contact.includes("@"))
    return createHash("sha256").update(`vouch-contact:${contact.trim().toLowerCase()}`).digest("hex");
  const digits = contact.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return createHash("sha256")
    .update(`vouch-contact:${digits.slice(-10)}`)
    .digest("hex");
}

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function optOutToken(hash: string): string {
  return signToken("outreach_opt_out", hash, "-", new Date(Date.now() + 2 * 365 * 86400_000));
}

export function optOutUrl(hash: string): string {
  return `${appUrl()}/stop/${optOutToken(hash)}`;
}

export function verifyOptOut(token: string): string | null {
  const v = verifyToken(token, ["outreach_opt_out"]);
  return v.ok && /^[0-9a-f]{64}$/.test(v.payload.s) ? v.payload.s : null;
}

export interface OutreachJob {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  summary: string;
  sourceType: "verified" | "sourced";
  applyMethod: string;
  applyTarget: string | null;
  isPublic: boolean;
  publicNumber?: number | null;
}

export function applyLine(job: OutreachJob): string {
  if (job.sourceType === "verified")
    return job.isPublic
      ? `See the job and apply on Vouch: ${appUrl()}${jobPath({ id: job.id, title: job.title, location: job.location, public_number: job.publicNumber })}`
      : "Reply to me if you're interested.";
  switch (job.applyMethod) {
    case "link":
      return `Apply on the employer's site: ${job.applyTarget}`;
    case "email":
      return `Apply by email: ${job.applyTarget}`;
    case "phone":
      return `Apply by phone: ${job.applyTarget}`;
    case "whatsapp":
      return `Apply via WhatsApp: ${job.applyTarget}`;
    default:
      return "Reply to me if you're interested.";
  }
}

export const DEFAULT_INTRO =
  "I came across your profile and think this role could be a good fit for your experience. Have a look and apply if it interests you.";

export function buildMessage(opts: {
  job: OutreachJob;
  personName: string | null;
  recruiterName: string;
  workspaceName: string;
  intro: string;
  optOut: string;
}): { subject: string; text: string } {
  const { job } = opts;
  const greeting = opts.personName ? `Hi ${opts.personName.split(/\s+/)[0]},` : "Hi,";
  const where = [job.company ?? "Hiring directly", job.location].filter(Boolean).join(" · ");
  const text = [
    greeting,
    "",
    opts.intro.trim(),
    "",
    `${job.title} (${where})`,
    job.summary.trim().slice(0, 600),
    "",
    applyLine(job),
    "",
    `${opts.recruiterName}, ${opts.workspaceName}`,
    "",
    "---",
    `Why you're getting this: ${opts.recruiterName} (${opts.workspaceName}) has your resume and thought this job fits it. Sent through Vouch.`,
    `Don't want job messages from recruiters on Vouch? Stop them here (one click): ${opts.optOut}`,
  ].join("\n");
  return { subject: `Job opportunity: ${job.title}`, text };
}
