import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // pdf.js loads its worker from disk; keep these as real node_modules instead of bundling.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // 5 MB resumes + form overhead
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
