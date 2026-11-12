#!/usr/bin/env node
// Local/test database helper for plain Postgres + pgvector (no Docker needed).
// Applies the Supabase shim, all migrations, and optionally seed.sql.
// Usage: node scripts/db-local.mjs reset [--seed] [--db name]
// For a real Supabase project use the Supabase CLI instead: `supabase db push`.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const dbName = args.includes("--db") ? args[args.indexOf("--db") + 1] : (process.env.LOCAL_DB_NAME ?? "hr_match");
const adminUrl = process.env.LOCAL_PG_ADMIN_URL ?? "postgresql://postgres@localhost:54322/postgres";
const root = new URL("..", import.meta.url).pathname;

export async function resetDatabase(name = dbName, { seed = false } = {}) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [name]);
  await admin.query(`drop database if exists "${name}"`);
  await admin.query(`create database "${name}"`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  const files = [join(root, "supabase/test-shim/00_supabase_shim.sql")];
  const migDir = join(root, "supabase/migrations");
  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) files.push(join(migDir, f));
  if (seed) files.push(join(root, "supabase/seed.sql"));
  for (const f of files) {
    try {
      await db.query(readFileSync(f, "utf8"));
    } catch (e) {
      await db.end();
      throw new Error(`Failed applying ${f}: ${e.message}`);
    }
  }
  await db.end();
  return url.toString();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (args[0] !== "reset") {
    console.error("usage: node scripts/db-local.mjs reset [--seed] [--db name]");
    process.exit(1);
  }
  resetDatabase(dbName, { seed: args.includes("--seed") })
    .then((u) => console.log(`database ready: ${u}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
