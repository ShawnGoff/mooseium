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

    // Public galleries, and the curators behind them. We join the owner's
    // username so we can list ONLY profiles that actually have public work —
    // empty profiles are thin pages that dilute the sitemap.
    const { data: galleries } = await supabase
      .from("galleries")
      .select(
        "share_slug, updated_at, profiles!galleries_user_id_fkey(username)"
      )
      .eq("is_public", true)
      .not("share_slug", "is", null)
      .limit(5000);

    type GalleryRow = {
      share_slug: string;
      updated_at: string | null;
      profiles: { username: string | null } | null;
    };

    const curators = new Set<string>();
    for (const g of (galleries as unknown as GalleryRow[] | null) ?? []) {
      routes.push({
        url: `${SITE_URL}/g/${g.share_slug}`,
        lastModified: g.updated_at ? new Date(g.updated_at) : undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      });
      const handle = g.profiles?.username;
      if (handle) curators.add(handle);
    }

    for (const handle of curators) {
      // The profile itself…
      routes.push({
        url: `${SITE_URL}/@${handle}`,
        changeFrequency: "weekly",
        priority: 0.5,
      });
      // …and their walkable 3D museum, which is otherwise only reachable via
      // an in-page link.
      routes.push({
        url: `${SITE_URL}/@${handle}/museum`,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // If the DB is unreachable at build/revalidate time, ship the static routes.
  }

  return routes;
}
