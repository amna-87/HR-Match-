import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/slug";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/recruiter",
          "/candidate",
          "/admin",
          "/onboarding",
          "/m/",
          "/stop/",
          "/unsubscribe/",
          "/login",
          "/signup",
        ],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
