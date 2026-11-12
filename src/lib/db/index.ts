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
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
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
