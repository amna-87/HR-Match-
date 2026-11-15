import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  let reason: string | undefined;
  if (process.env.DATABASE_URL) {
    try {
      await getPool().query("select 1");
      database = "ok";
    } catch (e) {
      database = "error";
      reason = describeDbError(e);
      console.error("[health] database check failed", e);
    }
  }
  const status = database === "error" ? 503 : 200;
  return NextResponse.json(
    {
      status: status === 200 ? "ok" : "degraded",
      database,
      ...(reason ? { reason } : {}),
      time: new Date().toISOString(),
    },
    { status },
  );
}

/** A short, non-secret category for setup troubleshooting (never the URL or password). */
function describeDbError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const code = err?.code ?? "";
  const msg = err?.message ?? "";
  if (code === "28P01" || /password authentication/i.test(msg)) return "wrong_password";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "host_not_found";
  if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || /timeout/i.test(msg)) return "cannot_connect";
  if (code === "3D000") return "database_not_found";
  if (/tenant or user not found/i.test(msg)) return "wrong_user_or_project";
  if (e instanceof TypeError || /invalid url/i.test(msg)) return "invalid_connection_string";
  if (/certificate|ssl|tls/i.test(msg)) return "ssl_error";
  return code ? `pg_${code}` : "unknown";
}
