import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep crawlers out of API and private/utility routes.
      disallow: [
        "/api/",
        "/account",
        "/collections",
        "/den",
        "/auth/",
        "/login",
        "/lab",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
