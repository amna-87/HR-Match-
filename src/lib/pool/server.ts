import "server-only";
import { getPool } from "@/lib/db";
import { getEmbeddingProvider } from "@/lib/matching/embeddings";
import { createServiceClient } from "@/lib/supabase/server";
import { extractResumeText } from "@/lib/parsing/extract-text";
import { computeExperienceYears, parseResumeText } from "@/lib/parsing/resume";
import { basicParseResume } from "@/lib/parsing/basic-resume";
import { AiUnavailableError } from "@/lib/parsing/claude";
import type { ParsedForPool, PoolProcessDeps } from "./process";

/** Claude parser (reused from v1.0), falling back to the offline reader when AI is off or fails. */
export async function parseForPool(text: string): Promise<ParsedForPool> {
  try {
    const parsed = await parseResumeText(text);
    return { parsed, years: computeExperienceYears(parsed.experiences), by: "ai" };
  } catch (e) {
    if (!(e instanceof AiUnavailableError)) console.warn("[pool] AI parse failed, using basic reader", e);
    const { experience_years_hint, ...parsed } = basicParseResume(text);
    return { parsed, years: experience_years_hint ?? 0, by: "basic" };
  }
}

export function poolDeps(): PoolProcessDeps {
  const storage = () => createServiceClient().storage.from("resumes");
  return {
    db: getPool(),
    embedder: getEmbeddingProvider(),
    async download(path) {
      const { data, error } = await storage().download(path);
      if (error || !data) throw new Error(`download failed: ${error?.message ?? "missing file"}`);
      return new Uint8Array(await data.arrayBuffer());
    },
    async remove(paths) {
      const p = paths.filter(Boolean);
      if (p.length) await storage().remove(p);
    },
    extract: extractResumeText,
    parse: parseForPool,
  };
}
