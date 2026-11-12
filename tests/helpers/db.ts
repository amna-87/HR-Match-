// Test helpers: a fresh database per test file (shim + migrations + seed), and
// a way to run SQL *as* a given Supabase role/user so RLS is actually exercised.
import pg from "pg";
import { resetDatabase } from "../../scripts/db-local.mjs";

export const IDS = {
  admin: "00000000-0000-4000-8000-000000000001",
  rita: "00000000-0000-4000-8000-000000000101", // Acme recruiter
  gary: "00000000-0000-4000-8000-000000000102", // Globex recruiter
  ivy: "00000000-0000-4000-8000-000000000103", // Initech recruiter
  maya: "00000000-0000-4000-8000-000000000201",
  jordan: "00000000-0000-4000-8000-000000000202",
  priya: "00000000-0000-4000-8000-000000000203",
  sam: "00000000-0000-4000-8000-000000000204",
  lena: "00000000-0000-4000-8000-000000000205",
  grace: "00000000-0000-4000-8000-000000000209",
  noah: "00000000-0000-4000-8000-000000000210",
  elena: "00000000-0000-4000-8000-000000000211",
  chris: "00000000-0000-4000-8000-000000000212",
  unclaimedCandidate: "00000000-0000-4000-8000-00000000a999",
  acme: "00000000-0000-4000-8000-00000000c001",
  globex: "00000000-0000-4000-8000-00000000c002",
  initech: "00000000-0000-4000-8000-00000000c003",
  jobSocial: "00000000-0000-4000-8000-00000000f001",
  jobBackend: "00000000-0000-4000-8000-00000000f002",
  jobAccountant: "00000000-0000-4000-8000-00000000f003",
  jobDraft: "00000000-0000-4000-8000-00000000f004",
  jobSourced: "00000000-0000-4000-8000-00000000f101",
} as const;

export type Actor =
  | { role: "anon" }
  | { role: "service_role" }
  | { role: "authenticated"; sub: string }
  | { role: "postgres" };

export class TestDb {
  constructor(public pool: pg.Pool, public url: string) {}

  /** Run one statement as an actor, in its own transaction. */
  async q<T extends pg.QueryResultRow = pg.QueryResultRow>(actor: Actor, sql: string, params: unknown[] = []) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (actor.role !== "postgres") {
        const claims = actor.role === "authenticated" ? { sub: actor.sub, role: "authenticated" } : { role: actor.role };
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await client.query(`set local role ${actor.role}`);
      }
      const res = await client.query<T>(sql, params);
      await client.query("commit");
      return res;
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  }

  as(sub: string) {
    return <T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) =>
      this.q<T>({ role: "authenticated", sub }, sql, params);
  }
  anon<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.q<T>({ role: "anon" }, sql, params);
  }
  service<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.q<T>({ role: "service_role" }, sql, params);
  }
  root<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.q<T>({ role: "postgres" }, sql, params);
  }

  async candidateId(userId: string): Promise<string> {
    const r = await this.root<{ id: string }>("select id from candidates where user_id = $1", [userId]);
    return r.rows[0].id;
  }

  async close() {
    await this.pool.end();
  }
}

export async function createTestDb(name: string): Promise<TestDb> {
  const dbName = `test_${name}_${process.pid}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const url = await resetDatabase(dbName, { seed: true });
  return new TestDb(new pg.Pool({ connectionString: url, max: 4 }), url);
}

/** Make a match "notified" the way the notifier would (service role). */
export async function suggestAndNotify(db: TestDb, jobId: string, candidateId: string, score = 85) {
  const r = await db.service<{ upsert_match: string }>(
    "select upsert_match($1, $2, $3, '{}'::jsonb, 'test', false)",
    [jobId, candidateId, score],
  );
  const matchId = r.rows[0].upsert_match;
  await db.service("select mark_match_notified($1, 14)", [matchId]);
  return matchId;
}
