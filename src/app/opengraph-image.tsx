import { LOGO_INNER, LOGO_OUTER } from "@/components/logo";
import { ImageResponse } from "next/og";

export const alt = "Vouch: jobs that fit you, hiring that respects people";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
        padding: 80,
        background: "linear-gradient(135deg, #14111f 0%, #2e1065 55%, #6d28d9 100%)",
        color: "white",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 44, fontWeight: 700 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <path d={LOGO_OUTER} fill="#f2f1f8" />
          <path d={LOGO_INNER} fill="#c4b5fd" />
        </svg>
        Vouch
      </div>
      <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1 }}>
        The right job for you. The right people for your team.
      </div>
      <div style={{ fontSize: 32, opacity: 0.9 }}>Browse every job free · Nothing shared without your OK</div>
    </div>,
    size,
  );
}
