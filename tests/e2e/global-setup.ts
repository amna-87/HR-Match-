// E2E setup for the LOCAL dev database only: E2E logs in many times from one IP,
// so reset the (working) rate limiter and age out email-throttle history.
import pg from "pg";

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) return;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("delete from public.rate_limits");
  // Repeated local runs would otherwise hit the (working) weekly match-email cap.
  await db.query(
    "update public.notifications set created_at = created_at - interval '8 days' where type = 'match_digest'",
  );
  await db.end();
}
