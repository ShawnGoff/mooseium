// /@handle — a curator's public profile: their bio + public galleries.
// Profile URLs are namespaced by a leading "@", so they never collide with
// static routes like /collections or /account.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import { safeJsonLd } from "@/lib/jsonld";

type ProfileRow = {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  if (!decoded.startsWith("@") || !isSupabaseConfigured()) return {};
  const username = decoded.slice(1).toLowerCase();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, bio")
    .eq("username", username)
    .single<{ display_name: string | null; username: string | null; bio: string | null }>();

  if (!profile) return { title: "Curator not found" };

  const name = profile.display_name || `@${profile.username}`;
  const title = `${name} (@${profile.username})`;
  const description =
    profile.bio || `${name}'s public art galleries on Mooseium.`;

  return {
    title,
    description,
    alternates: { canonical: `/@${profile.username}` },
    openGraph: { title: `${title} · Mooseium`, description, type: "profile" },
    twitter: { card: "summary", title: `${title} · Mooseium`, description },
  };
}

type GalleryRow = {
  name: string;
  share_slug: string | null;
  created_at: string;
  placed_artworks: {
    created_at: string;
    artworks: { image_thumb_url: string | null } | null;
  }[];
};

function Mosaic({ thumbs }: { thumbs: string[] }) {
  return (
    <div className="preview-frame">
      {thumbs.length === 0 ? (
        <div className="preview-mosaic empty">No pieces yet</div>
      ) : (
        <div className={`preview-mosaic n${Math.min(thumbs.length, 4)}`}>
          {thumbs.slice(0, 4).map((t, i) => (
            <div className="preview-cell" key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t} alt="" loading="lazy" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);

  // Only "@name" URLs are profiles; anything else falls through to a 404.
  if (!decoded.startsWith("@")) notFound();
  const username = decoded.slice(1).toLowerCase();

  if (!isSupabaseConfigured()) notFound();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username, bio")
    .eq("username", username)
    .single<ProfileRow>();

  if (!profile) notFound();

  const { data: galleryData } = await supabase
    .from("galleries")
    .select(
      "name, share_slug, created_at, placed_artworks(created_at, artworks(image_thumb_url))"
    )
    .eq("user_id", profile.id)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const galleries = ((galleryData as GalleryRow[] | null) ?? [])
    .filter((g) => g.share_slug)
    .map((g) => {
      const thumbs = [...(g.placed_artworks ?? [])]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((p) => p.artworks?.image_thumb_url)
        .filter((u): u is string => Boolean(u));
      return {
        slug: g.share_slug as string,
        name: g.name,
        count: g.placed_artworks?.length ?? 0,
        thumbs,
      };
    });

  const name = profile.display_name || `@${profile.username}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name,
      ...(profile.username ? { alternateName: `@${profile.username}` } : {}),
      ...(profile.bio ? { description: profile.bio } : {}),
    },
  };

  return (
    <main className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <header className="profile-header">
        <h1>{name}</h1>
        {profile.username && <p className="profile-handle">@{profile.username}</p>}
        {profile.bio && <p className="profile-bio">{profile.bio}</p>}
        {profile.username && galleries.length > 0 && (
          <Link className="museum-cta" href={`/@${profile.username}/museum`}>
            🏛 Walk this museum in 3D <span className="beta-tag">beta</span>
          </Link>
        )}
      </header>

      <div className="brand" style={{ marginTop: "2rem" }}>
        <h2>Public galleries</h2>
        <span className="tag">{galleries.length}</span>
      </div>

      {galleries.length === 0 ? (
        <p className="status">No public galleries yet.</p>
      ) : (
        <section className="grid">
          {galleries.map((g) => (
            <Link key={g.slug} href={`/g/${g.slug}`} className="card collection-card">
              <Mosaic thumbs={g.thumbs} />
              <div className="meta">
                <p className="title">{g.name}</p>
                <p className="sub">
                  {g.count} {g.count === 1 ? "piece" : "pieces"}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}
