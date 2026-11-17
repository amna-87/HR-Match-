// Apply contacts on public pages (addendum 4 + 7c). Apply links are shown
// directly. Phone and WhatsApp numbers and personal email addresses are masked
// in the page text and revealed only to signed-in users or after a human check.
// Company-style addresses (jobs@, careers@, hr@ ...) are fine to show.

const ROLE_LOCALPARTS =
  /^(jobs?|careers?|hr|hiring|recruit(ment|ing|er)?|talent|apply|applications?|people|team|info|contact|hello|work|vacanc(y|ies)|cv|resumes?)([._+-].*)?$/i;
const FREE_MAIL =
  /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|aol|proton(mail)?|gmx|mail|yandex|zoho)\./i;

export function isCompanyStyleEmail(email: string): boolean {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return false;
  return ROLE_LOCALPARTS.test(local) && !FREE_MAIL.test(`@${domain}`);
}

/** True when the apply contact must not appear in public page text. */
export function isPrivateContact(method: string, target: string | null): boolean {
  if (!target) return false;
  if (method === "phone" || method === "whatsapp") return true;
  if (method === "email") return !isCompanyStyleEmail(target);
  return false;
}

export function maskPhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.length < 6) return "•••";
  return `${p.trim().startsWith("+") ? "+" : ""}${digits.slice(0, 3)} ••• •• ${digits.slice(-2)}`;
}

export function maskEmail(e: string): string {
  const [local, domain] = e.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

export function maskContact(method: string, target: string): string {
  return method === "email" ? maskEmail(target) : maskPhone(target);
}

const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_IN_TEXT = /(?:\+|\b)\d[\d\s().-]{7,}\d\b/g;

/** Mask phone numbers and personal emails inside free text (e.g. "how to apply" notes). */
export function maskContactsInText(text: string): string {
  return text
    .replace(EMAIL_IN_TEXT, (m) => (isCompanyStyleEmail(m) ? m : maskEmail(m)))
    .replace(PHONE_IN_TEXT, (m) => maskPhone(m));
}

export function whatsappHref(target: string, title?: string): string {
  const digits = target.replace(/\D/g, "");
  const text = title ? `?text=${encodeURIComponent(`Hi, I'm interested in the ${title} job I saw on Vouch.`)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function applyHref(method: string, target: string | null, title?: string): string | null {
  if (!target) return null;
  if (method === "email")
    return `mailto:${target}${title ? `?subject=${encodeURIComponent(`Application: ${title}`)}` : ""}`;
  if (method === "phone") return `tel:${target.replace(/[^\d+]/g, "")}`;
  if (method === "whatsapp") return whatsappHref(target, title);
  if (method === "link") return target;
  return null;
}

export const APPLY_LABEL: Record<string, string> = {
  email: "Apply by email",
  phone: "Apply by phone",
  whatsapp: "Apply via WhatsApp",
  link: "Apply on the employer's site",
};
