import { ImageResponse } from "next/og";
import { getPool } from "@/lib/db";
import { parseJobParam } from "@/lib/slug";

export const alt = "Job on Vouch";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share preview image per job (WhatsApp, LinkedIn, X). No contact details. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const p = parseJobParam((await params).id);
  let title = "Find work that fits you";
  let sub = "Open roles on Vouch";
  if (p.kind === "number") {
    const r = await getPool()
      .query<{ title: string; location: string | null; company: string | null; work_mode: string }>(
        `select j.title, j.location, j.work_mode, coalesce(co.name, j.source_company_name) company
         from public.jobs j left join public.companies co on co.id = j.company_id and co.kind = 'company'
         where j.public_number = $1 and j.visibility = 'public' and j.status = 'published'`,
        [p.n],
      )
      .catch(() => ({ rows: [] as never[] }));
    const j = r.rows[0];
    if (j) {
      title = j.title;
      sub = [j.company ?? "Hiring directly", j.location, j.work_mode === "remote" ? "Remote" : null]
        .filter(Boolean)
        .join(" · ");
    }
  }
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(135deg, #312e81 0%, #4338ca 55%, #0d9488 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "white",
            color: "#4338ca",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          V
        </div>
        Vouch
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: title.length > 40 ? 64 : 80, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ fontSize: 36, opacity: 0.9 }}>{sub}</div>
      </div>
      <div style={{ fontSize: 28, opacity: 0.85 }}>Apply in a few clicks · Nothing shared without your OK</div>
    </div>,
    size,
  );
}
