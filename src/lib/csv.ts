// Minimal RFC 4180 CSV reader (quotes, escaped quotes, commas/newlines in
// quotes, CRLF). Also accepts semicolon- or tab-separated files (Excel exports).
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Vouch fields a CSV column can map to. */
export const CSV_FIELDS = [
  { key: "title", label: "Job title", required: true, guess: /^(job\s*)?(title|position|role|designation)$/i },
  { key: "company", label: "Company", guess: /company|employer|organi[sz]ation|client/i },
  { key: "description", label: "Description / summary", guess: /desc|summary|details|about/i },
  { key: "location", label: "Location", guess: /location|city|place/i },
  { key: "apply_email", label: "Apply email", guess: /e-?mail/i },
  { key: "apply_whatsapp", label: "Apply WhatsApp", guess: /whats\s?app/i },
  { key: "apply_phone", label: "Apply phone", guess: /phone|mobile|contact\s*(no|number)|cell/i },
  { key: "apply_link", label: "Apply link", guess: /apply|link|url/i },
  { key: "source", label: "Source name", guess: /^source$|source\s*name|posted\s*on|channel/i },
  { key: "skills", label: "Skills", guess: /skill/i },
  { key: "work_mode", label: "Work mode (remote/hybrid/on-site)", guess: /work\s*mode|remote|workplace/i },
  { key: "employment_type", label: "Job type (full-time…)", guess: /type|employment|commitment/i },
  { key: "min_exp", label: "Years of experience", guess: /experience|years|exp/i },
] as const;
export type CsvField = (typeof CSV_FIELDS)[number]["key"];

/** Best guess of which column feeds each field (each column used once). */
export function guessMapping(headers: string[]): Partial<Record<CsvField, number>> {
  const used = new Set<number>();
  const out: Partial<Record<CsvField, number>> = {};
  for (const f of CSV_FIELDS) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && f.guess.test(h.trim()));
    if (i >= 0) {
      out[f.key] = i;
      used.add(i);
    }
  }
  return out;
}

export const CSV_MAX_ROWS = 500;
