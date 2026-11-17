import type { Queryable } from "@/lib/db";
import type { EngineDeps } from "@/lib/matching/engine";
import { runPendingMatching } from "@/lib/matching/engine";
import { runNotifier } from "@/lib/email/notifier";
import type { EmailSender } from "@/lib/email/sender";
import { processPoolQueue, type PoolProcessDeps } from "@/lib/pool/process";
import { syncDueFeeds, type SyncDeps } from "@/lib/connectors/sync";

/** One scheduled tick: expire stale items, catch up on matching, then notify. */
export async function runScheduledTick(
  db: Queryable,
  engine: EngineDeps,
  sender: EmailSender,
  pool?: PoolProcessDeps,
  feeds?: SyncDeps,
) {
  const poolQueue = pool ? await processPoolQueue(pool, { budgetMs: 120_000 }) : null;
  const feedSync = feeds ? await syncDueFeeds(feeds) : null;
  const expiry = (await db.query<{ r: Record<string, number> }>("select public.run_expiry() as r")).rows[0].r;
  const matching = await runPendingMatching(engine);
  const notify = await runNotifier({ db, sender });
  return { poolQueue, feedSync, expiry, matching, notify };
}
