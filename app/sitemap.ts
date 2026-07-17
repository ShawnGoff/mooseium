import type { MetadataRoute } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

// Rebuild the sitemap hourly so newly published galleries get discovered.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/tutorial`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/museums`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/galleries`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/library`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/credits`, changeFrequency: "monthly", priority: 0.2 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  for (const slug of ["met", "artic", "cleveland", "rijks", "harvard", "smithsonian"]) {
    routes.push({
      url: `${SITE_URL}/museums/${slug}`,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  if (!isSupabaseConfigured()) return routes;

  try {
    const supabase = await createClient();

    const { data: galleries } = await supabase
      .from("galleries")
      .select("share_slug, updated_at")
      .eq("is_public", true)
      .not("share_slug", "is", null)
      .limit(5000);

    for (const g of (galleries as { share_slug: string; updated_at: string | null }[] | null) ?? []) {
      routes.push({
        url: `${SITE_URL}/g/${g.share_slug}`,
        lastModified: g.updated_at ? new Date(g.updated_at) : undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("username")
      .not("username", "is", null)
      .limit(5000);

    for (const p of (profiles as { username: string }[] | null) ?? []) {
      routes.push({
        url: `${SITE_URL}/@${p.username}`,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // If the DB is unreachable at build/revalidate time, ship the static routes.
  }

  return routes;
}
