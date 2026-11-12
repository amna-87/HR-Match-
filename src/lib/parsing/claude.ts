// Thin wrapper around the Anthropic SDK for structured extraction.
// LLM calls are used only where they add value (Section 10): resume parsing,
// paste-to-structure, and the optional match re-rank.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export class AiUnavailableError extends Error {}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiUnavailableError("AI parsing is not configured (ANTHROPIC_API_KEY is not set)");
  }
  client ??= new Anthropic({ maxRetries: 2, timeout: 90_000 });
  return client;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Ask Claude to fill a Zod schema from untrusted text. The text is passed as
 * data inside tags; the system prompt tells the model to ignore instructions in it.
 */
export async function extractStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  documentLabel: string;
  text: string;
}): Promise<z.infer<S>> {
  const anthropic = getClient();
  const response = await anthropic.beta.messages.parse({
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
    max_tokens: 16000,
    // Extraction is a routine task: low effort keeps cost and latency down.
    output_config: { effort: "low", format: betaZodOutputFormat(opts.schema) },
    // If a request is declined by a safety classifier, retry on a fallback model server-side.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    messages: [
      {
        role: "user",
        content: `<${opts.documentLabel}>\n${opts.text}\n</${opts.documentLabel}>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("The AI declined to process this document");
  if (response.stop_reason === "max_tokens") throw new Error("Document too long to parse");
  if (!response.parsed_output) throw new Error("AI returned no structured output");
  return response.parsed_output as z.infer<S>;
}
