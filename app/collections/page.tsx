// /collections — a visual grid of the user's collections, each with a preview
// mosaic of up to 4 pieces.

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";

type GalleryRow = {
  id: string;
  name: string;
  is_public: boolean;
  created_at: string;
  placed_artworks: {
    created_at: string;
    artworks: { image_thumb_url: string | null } | null;
  }[];
};

function Mosaic({ thumbs }: { thumbs: string[] }) {
  if (thumbs.length === 0) {
    return (
      <div className="preview-frame">
        <div className="preview-mosaic empty">No pieces yet</div>
      </div>
    );
  }
  const cells = thumbs.slice(0, 4);
  return (
    <div className="preview-frame">
      <div className={`preview-mosaic n${cells.length}`}>
        {cells.map((t, i) => (
          <div className="preview-cell" key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={t} alt="" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function CollectionsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="container">
        <h1>Your collections</h1>
        <p className="status">Connect Supabase to create collections.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="container">
        <h1>Your collections</h1>
        <p className="status">
          Please <Link href="/login">sign in</Link> to see your collections.
        </p>
      </main>
    );
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();
  const myHandle = (me as { username: string | null } | null)?.username ?? null;

  const { data } = await supabase
    .from("galleries")
    .select(
      "id, name, is_public, created_at, placed_artworks(created_at, artworks(image_thumb_url))"
    )
    .eq("user_id", user.id);

  // Galleries this user has bookmarked from other curators.
  const { data: savedRows } = await supabase
    .from("saved_galleries")
    .select(
      "created_at, galleries(name, share_slug, is_public, placed_artworks(created_at, artworks(image_thumb_url)), profiles!galleries_user_id_fkey(display_name, username))"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  type SavedRow = {
    created_at: string;
    galleries: {
      name: string;
      share_slug: string | null;
      is_public: boolean;
      placed_artworks: {
        created_at: string;
        artworks: { image_thumb_url: string | null } | null;
      }[];
      profiles: { display_name: string | null; username: string | null } | null;
    } | null;
  };

  const savedGalleries = ((savedRows as SavedRow[] | null) ?? [])
    .filter((r) => r.galleries?.is_public && r.galleries?.share_slug)
    .map((r) => {
      const g = r.galleries!;
      const thumbs = [...(g.placed_artworks ?? [])]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((p) => p.artworks?.image_thumb_url)
        .filter((u): u is string => Boolean(u));
      return {
        slug: g.share_slug as string,
        name: g.name,
        count: g.placed_artworks?.length ?? 0,
        thumbs,
        curator: g.profiles?.display_name ?? "A curator",
        handle: g.profiles?.username ?? undefined,
      };
    });

  const collections = ((data as GalleryRow[] | null) ?? [])
    .map((g) => {
      const placed = [...(g.placed_artworks ?? [])].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1
      );
      const thumbs = placed
        .map((p) => p.artworks?.image_thumb_url)
        .filter((u): u is string => Boolean(u));
      const lastActivity = placed.reduce(
        (max, p) => (p.created_at > max ? p.created_at : max),
        g.created_at
      );
      return {
        id: g.id,
        name: g.name,
        isPublic: g.is_public,
        count: placed.length,
        thumbs,
        lastActivity,
      };
    })
    .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));

  return (
    <main className="container">
      <div className="brand">
        <h1>Your collections</h1>
        <span className="tag">{collections.length} total</span>
      </div>

      {myHandle ? (
        <Link className="museum-cta" href={`/@${myHandle}/museum`}>
          🏛 Walk your 3D museum <span className="beta-tag">beta</span>
        </Link>
      ) : (
        <p className="status">
          <Link href="/account">Set a handle</Link> to walk your galleries as a 3D
          museum.
        </p>
      )}

      {collections.length === 0 ? (
        <p className="status">
          No collections yet. <Link href="/">Search for art</Link> and hit Save —
          you can name a new collection right in the save dialog.
        </p>
      ) : (
        <section className="grid">
          {collections.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`} className="card collection-card">
              <Mosaic thumbs={c.thumbs} />
              <div className="meta">
                <p className="title">{c.name}</p>
                <p className="sub">
                  {c.count} {c.count === 1 ? "piece" : "pieces"}
                  {c.isPublic ? " · public" : ""}
                </p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {savedGalleries.length > 0 && (
        <>
          <div className="brand" style={{ marginTop: "2.5rem" }}>
            <h2>Saved galleries</h2>
            <span className="tag">{savedGalleries.length}</span>
          </div>
          <section className="grid">
            {savedGalleries.map((s) => (
              <Link key={s.slug} href={`/g/${s.slug}`} className="card collection-card">
                <Mosaic thumbs={s.thumbs} />
                <div className="meta">
                  <p className="title">{s.name}</p>
                  <p className="sub">
                    Curated by: {s.curator}
                    {s.handle ? ` · @${s.handle}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
