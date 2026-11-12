import "server-only";
import { headers } from "next/headers";
import { getPool } from "@/lib/db";
import { getEmbeddingProvider } from "@/lib/matching/embeddings";
import { getReranker } from "@/lib/matching/rerank";
import type { EngineDeps } from "@/lib/matching/engine";
import { privacyHash } from "@/lib/consent/hash";

export function engineDeps(): EngineDeps {
  return { db: getPool(), embedder: getEmbeddingProvider(), reranker: getReranker() };
}

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent") ?? "";
  return { ip, ipHash: privacyHash(ip), uaHash: privacyHash(ua) };
}

/** App-level audit entries (e.g. admin actions) written by trusted server code. */
export async function audit(
  actor: string | null,
  actorRole: string,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: object = {},
) {
  await getPool().query(
    "insert into public.audit_log(actor, actor_role, action, entity, entity_id, metadata) values ($1, $2, $3, $4, $5, $6::jsonb)",
    [actor, actorRole, action, entity, entityId, JSON.stringify(metadata)],
  );
}
