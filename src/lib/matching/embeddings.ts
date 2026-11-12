// Embeddings providers. Vectors are 1024-dimensional to match the schema.
//  - "voyage": Voyage AI (voyage-3.5, 1024 dims) — recommended for production.
//  - "local": deterministic feature-hashing embedder — dev/tests/offline only.
// See docs/decisions.md D-003.
import { createHash } from "node:crypto";
import { normalizeSkill } from "./skills";

export const EMBEDDING_DIMS = 1024;

export interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
}

const STOPWORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or our the to was we were will with you your this that their they them i my me who what which our years year experience including across using used".split(
    " ",
  ),
);

function hashToIndex(token: string): { idx: number; sign: number } {
  const h = createHash("sha256").update(token).digest();
  const n = h.readUInt32BE(0);
  return { idx: n % EMBEDDING_DIMS, sign: h[4] & 1 ? 1 : -1 };
}

function tokenize(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return words;
}

/** Deterministic bag-of-words + bigram feature hashing, L2-normalized. */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local";
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
  embedOne(text: string): number[] {
    const v = new Array<number>(EMBEDDING_DIMS).fill(0);
    const words = tokenize(text);
    const counts = new Map<string, number>();
    const add = (tok: string, w: number) => counts.set(tok, (counts.get(tok) ?? 0) + w);
    for (let i = 0; i < words.length; i++) {
      add(`w:${normalizeSkill(words[i])}`, 1);
      if (i + 1 < words.length) add(`b:${normalizeSkill(`${words[i]} ${words[i + 1]}`)}`, 1.5);
    }
    for (const [tok, c] of counts) {
      const { idx, sign } = hashToIndex(tok);
      v[idx] += sign * (1 + Math.log(c));
    }
    const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = "voyage";
  constructor(
    private apiKey: string,
    private model = "voyage-3.5",
  ) {}
  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 64) {
      const batch = texts.slice(i, i + 64);
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ input: batch, model: this.model, input_type: kind, output_dimension: EMBEDDING_DIMS }),
      });
      if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      for (const d of json.data.sort((a, b) => a.index - b.index)) out.push(d.embedding);
    }
    return out;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const name = process.env.EMBEDDINGS_PROVIDER ?? "local";
  if (name === "voyage") {
    const key = process.env.VOYAGE_API_KEY;
    if (!key) throw new Error("EMBEDDINGS_PROVIDER=voyage requires VOYAGE_API_KEY");
    return new VoyageEmbeddingProvider(key, process.env.VOYAGE_MODEL ?? "voyage-3.5");
  }
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_EMBEDDINGS !== "true") {
    console.warn("[matching] Using the local embedder in production. Set EMBEDDINGS_PROVIDER=voyage.");
  }
  return new LocalEmbeddingProvider();
}

export function textHash(providerName: string, text: string): string {
  return createHash("sha256").update(`${providerName}\n${text}`).digest("hex").slice(0, 32);
}

export function toPgVector(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}
