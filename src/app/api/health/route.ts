import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let database: "ok" | "unconfigured" | "error" = "unconfigured";
  if (process.env.DATABASE_URL) {
    try {
      await getPool().query("select 1");
      database = "ok";
    } catch {
      database = "error";
    }
  }
  const status = database === "error" ? 503 : 200;
  return NextResponse.json(
    { status: status === 200 ? "ok" : "degraded", database, time: new Date().toISOString() },
    { status },
  );
}
