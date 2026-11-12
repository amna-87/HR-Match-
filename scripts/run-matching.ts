// Run the matching engine for everything flagged needs_matching.
// Usage: DATABASE_URL=... npm run matching:run
import { getPool } from "../src/lib/db";
import { runPendingMatching } from "../src/lib/matching/engine";
import { getEmbeddingProvider } from "../src/lib/matching/embeddings";
import { getReranker } from "../src/lib/matching/rerank";

const pool = getPool();
runPendingMatching({ db: pool, embedder: getEmbeddingProvider(), reranker: getReranker() }, 1000)
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .finally(() => pool.end());
