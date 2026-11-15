// Direct Postgres access for TRUSTED server code only (matching engine, notifier,
// erasure, cron). Connects as a privileged role and bypasses RLS, so never call
// it with user-controlled SQL and never import it from client components.
// On Supabase use the pooled connection string (Supavisor, transaction mode).
import pg from "pg";

export interface Queryable {
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]): Promise<pg.QueryResult<T>>;
}

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL?.trim();
    if (!raw) throw new Error("DATABASE_URL is not set");
    const local = /localhost|127\.0\.0\.1/.test(raw);
    // node-pg treats sslmode=require as "verify the certificate", which fails against Supabase's
    // pooler chain. Strip it and set TLS explicitly (still encrypted in transit).
    const url = new URL(raw);
    const sslmode = url.searchParams.get("sslmode");
    url.searchParams.delete("sslmode");
    const ssl = local || sslmode === "disable" ? undefined : { rejectUnauthorized: false };
    pool = new pg.Pool({
      connectionString: url.toString(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl,
      connectionTimeoutMillis: 10_000,
    });
  }
  return pool;
}

/** Run fn inside a transaction on a dedicated client. */
export async function withTransaction<T>(fn: (c: pg.PoolClient) => Promise<T>, p: pg.Pool = getPool()): Promise<T> {
  const client = await p.connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
