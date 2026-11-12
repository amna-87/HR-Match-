// File validation + text extraction for resumes. We only READ text from the
// document; nothing in it is executed (no macros, scripts or embedded objects).
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type ResumeKind = "pdf" | "docx";

export type ValidationResult = { ok: true; kind: ResumeKind; mime: string; ext: string } | { ok: false; error: string };

/** Validate by size, extension AND magic bytes (never trust the client's MIME type). */
export function validateResumeFile(name: string, bytes: Uint8Array): ValidationResult {
  if (bytes.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (bytes.byteLength > MAX_RESUME_BYTES) return { ok: false, error: "The file is larger than 5 MB." };
  const lower = name.toLowerCase();
  const isPdfMagic = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  const isZipMagic = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04; // PK..
  if (lower.endsWith(".pdf") && isPdfMagic) return { ok: true, kind: "pdf", mime: PDF_MIME, ext: "pdf" };
  if (lower.endsWith(".docx") && isZipMagic) {
    // a .docx is a zip containing word/document.xml
    const head = Buffer.from(bytes.subarray(0, Math.min(bytes.byteLength, 200_000))).toString("latin1");
    if (head.includes("word/") || head.includes("[Content_Types].xml")) return { ok: true, kind: "docx", mime: DOCX_MIME, ext: "docx" };
  }
  return { ok: false, error: "Please upload a PDF or DOCX file." };
}

const EXTRACT_TIMEOUT_MS = 20_000;
const MAX_TEXT_CHARS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Text extraction timed out")), ms))]);
}

export async function extractResumeText(kind: ResumeKind, bytes: Uint8Array): Promise<string> {
  const text = await withTimeout(kind === "pdf" ? extractPdf(bytes) : extractDocx(bytes), EXTRACT_TIMEOUT_MS);
  return text.replace(/\u0000/g, "").slice(0, MAX_TEXT_CHARS);
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true });
  try {
    const result = await parser.getText({ first: 20 }); // first 20 pages is plenty for a resume
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}
