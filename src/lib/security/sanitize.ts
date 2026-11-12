// Input sanitization for free text (pasted job posts, resume text, form fields).
// We render with React (auto-escaped), but also strip markup/control chars so
// stored text is clean and can't smuggle HTML into emails or LLM prompts.

const CONTROL = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028\\u2029\\uFEFF]",
  "g",
);

export function stripHtml(input: string): string {
  return input
    .replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function sanitizeText(input: string | null | undefined, maxLength = 20000): string {
  if (!input) return "";
  return stripHtml(String(input))
    .replace(CONTROL, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeLine(input: string | null | undefined, maxLength = 300): string {
  return sanitizeText(input, maxLength).replace(/\n+/g, " ").trim();
}

export function sanitizeList(items: unknown, maxItems = 50, maxLength = 100): string[] {
  const arr = Array.isArray(items) ? items : typeof items === "string" ? items.split(/[,\n]/) : [];
  const out: string[] = [];
  for (const it of arr) {
    const s = sanitizeLine(String(it ?? ""), maxLength);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function safeHttpUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    const u = new URL(input.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
