"use server";
// Job pictures (D-036): upload a flyer / screenshot, store it privately in the
// workspace's folder and, when AI is configured, read the job from it.
import { randomUUID } from "node:crypto";
import { requireRecruiter } from "@/lib/auth/session";
import { getPool } from "@/lib/db";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { aiConfigured } from "@/lib/parsing/claude";
import { parseJobImage } from "@/lib/parsing/job";
import type { ParsedJob } from "@/lib/parsing/schemas";

export type ImageState = { imagePath?: string; parsed?: ParsedJob; error?: string; note?: string };

const MAX = 5 * 1024 * 1024;

function sniff(b: Uint8Array): { mime: "image/png" | "image/jpeg" | "image/webp"; ext: string } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45)
    return { mime: "image/webp", ext: "webp" };
  return null;
}

export async function uploadJobImage(_prev: ImageState, formData: FormData): Promise<ImageState> {
  const { company, user } = await requireRecruiter();
  if (!company) return { error: "Set up your workspace first." };
  const file = formData.get("image");
  if (!(file instanceof File) || !file.size) return { error: "Choose a picture (PNG, JPG or WebP)." };
  if (file.size > MAX) return { error: "The picture is larger than 5 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return { error: "That file isn't a PNG, JPG or WebP picture." };
  if (!(await checkRateLimit(getPool(), "parse", user.id))) return { error: "Too many uploads. Try again later." };
  const path = `${company.id}/${randomUUID()}.${kind.ext}`;
  const up = await createServiceClient()
    .storage.from("job-images")
    .upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) return { error: "Could not store the picture. Try again." };
  if (!aiConfigured())
    return {
      imagePath: path,
      note: "Picture added. Reading text from pictures needs AI (not switched on yet), so please fill in the details.",
    };
  try {
    return {
      imagePath: path,
      parsed: await parseJobImage(bytes, kind.mime),
      note: "Read from the picture. Please check every field.",
    };
  } catch (e) {
    console.warn("[jobs] image extraction failed", e);
    return { imagePath: path, note: "Picture added, but we couldn't read it. Please fill in the details." };
  }
}
