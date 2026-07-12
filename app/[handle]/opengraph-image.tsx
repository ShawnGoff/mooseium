// Dynamic Open Graph image for /@handle — the curator's name over a row of
// their framed art, embedded as data so museum-CDN hotlink protection can't
// block the preview. Next wires this to the route's og:image / twitter:image.

import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { isAllowedMuseumImage } from "@/lib/museum-image";

export const alt = "A curator on Mooseium";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const CINZEL_WOFF =
  "https://cdn.jsdelivr.net/npm/@fontsource/cinzel@5.2.8/files/cinzel-latin-600-normal.woff";

async function toDataUrl(url: string): Promise<string | null> {
  if (!isAllowedMuseumImage(url)) return null;
  try {
    const origin = new URL(url).origin;
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: `${origin}/`,
      },
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

type GalRow = {
  placed_artworks: {
    sort_order: number;
    section: string | null;
    artworks: { image_thumb_url: string | null; image_medium_url: string | null } | null;
  }[];
};

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  const username = decoded.replace(/^@/, "").toLowerCase();

  let name = "A Curator";
  let atHandle = "";
  let bio = "";
  let galleryCount = 0;
  let pieceCount = 0;
  const imageUrls: string[] = [];

  if (decoded.startsWith("@") && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, username, bio")
        .eq("username", username)
        .single<{
          id: string;
          display_name: string | null;
          username: string | null;
          bio: string | null;
        }>();

      if (profile) {
        name = profile.display_name || `@${profile.username}`;
        atHandle = profile.username ? `@${profile.username}` : "";
        bio = profile.bio || "";

        const { data: gals } = await supabase
          .from("galleries")
          .select(
            "placed_artworks(sort_order, section, artworks(image_thumb_url, image_medium_url))"
          )
          .eq("user_id", profile.id)
          .eq("is_public", true)
          .not("share_slug", "is", null)
          .order("updated_at", { ascending: false })
          .limit(40);

        for (const g of (gals as unknown as GalRow[] | null) ?? []) {
          const pieces = g.placed_artworks ?? [];
          galleryCount += pieces.length ? 1 : 0;
          pieceCount += pieces.length;
          const sorted = [...pieces].sort((a, b) => {
            if (a.section === "feature" && b.section !== "feature") return -1;
            if (b.section === "feature" && a.section !== "feature") return 1;
            return a.sort_order - b.sort_order;
          });
          for (const p of sorted) {
            const u = p.artworks?.image_thumb_url || p.artworks?.image_medium_url;
            if (u && imageUrls.length < 4 && !imageUrls.includes(u)) imageUrls.push(u);
          }
        }
      }
    } catch {
      /* text-only fallback */
    }
  }

  const frames = (await Promise.all(imageUrls.slice(0, 4).map(toDataUrl))).filter(
    (d): d is string => Boolean(d)
  );

  let fonts:
    | { name: string; data: ArrayBuffer; weight: 600; style: "normal" }[]
    | undefined;
  try {
    const f = await fetch(CINZEL_WOFF);
    if (f.ok) {
      fonts = [
        { name: "Cinzel", data: await f.arrayBuffer(), weight: 600, style: "normal" },
      ];
    }
  } catch {
    /* default font is fine */
  }
  const titleFamily = fonts ? "Cinzel" : "Georgia, serif";
  const bioShort = bio.length > 120 ? bio.slice(0, 118) + "…" : bio;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #211d19, #322a22)",
          color: "#f3efe9",
        }}
      >
        {frames.length > 0 ? (
          <div style={{ display: "flex", gap: 18 }}>
            {frames.map((src, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  width: 250,
                  height: 260,
                  border: "7px solid #14110e",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} width={236} height={246} style={{ objectFit: "cover" }} alt="" />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 40, color: "#6a6157" }}>🏛</div>
        )}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 72,
              fontFamily: titleFamily,
              color: "#e9d9b0",
              letterSpacing: 2,
              lineHeight: 1.05,
            }}
          >
            {name.toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#b7ad9d", marginTop: 12 }}>
            {atHandle}
            {galleryCount
              ? `${atHandle ? " · " : ""}${galleryCount} ${galleryCount === 1 ? "gallery" : "galleries"} · ${pieceCount} pieces`
              : ""}
          </div>
          {bioShort ? (
            <div style={{ display: "flex", fontSize: 26, color: "#8a8072", marginTop: 12 }}>
              {bioShort}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", fontSize: 27, color: "#d8bd85", letterSpacing: 1 }}>
          🏛 MOOSEIUM
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
