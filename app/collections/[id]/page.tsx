// /collections/[id] — view + manage one collection (rename, delete, remove pieces).

import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import CollectionView, { type Piece } from "./CollectionView";

type PlacedRow = {
  sort_order: number;
  section: string | null;
  note: string | null;
  artworks: {
    id: string;
    source_museum: string | null;
    museum_object_id: string | null;
    title: string | null;
    artist: string | null;
    date_text: string | null;
    medium: string | null;
    culture: string | null;
    dimensions: string | null;
    object_type: string | null;
    description: string | null;
    credit_line: string | null;
    license: string | null;
    tags: string[] | null;
    source_url: string | null;
    image_medium_url: string | null;
    image_thumb_url: string | null;
  } | null;
};

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="container">
        <p className="status">Connect Supabase to view collections.</p>
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
        <p className="status">
          Please <Link href="/login">sign in</Link> to view this collection.
        </p>
      </main>
    );
  }

  const { data: gallery } = await supabase
    .from("galleries")
    .select("id, name, is_public, share_slug, guestbook_enabled, wing, in_museum")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!gallery) notFound();

  // Existing wing names across this user's collections, for the assignment
  // dropdown (so they can reuse a wing they've already created).
  const { data: wingRows } = await supabase
    .from("galleries")
    .select("wing")
    .eq("user_id", user.id)
    .not("wing", "is", null);
  const wingNames = Array.from(
    new Set(
      ((wingRows as { wing: string | null }[] | null) ?? [])
        .map((r) => (r.wing ?? "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const { data } = await supabase
    .from("placed_artworks")
    .select(
      "sort_order, section, note, artworks(id, source_museum, museum_object_id, title, artist, date_text, medium, culture, dimensions, object_type, description, credit_line, license, tags, source_url, image_medium_url, image_thumb_url)"
    )
    .eq("gallery_id", id)
    .order("sort_order", { ascending: true });

  const pieces: Piece[] = ((data as PlacedRow[] | null) ?? [])
    .filter((row) => row.artworks)
    .map((row) => {
      const a = row.artworks!;
      return {
        artworkId: a.id,
        museumObjectId: a.museum_object_id ?? undefined,
        title: a.title ?? "Untitled",
        artist: a.artist ?? undefined,
        dateText: a.date_text ?? undefined,
        medium: a.medium ?? undefined,
        culture: a.culture ?? undefined,
        dimensions: a.dimensions ?? undefined,
        objectType: a.object_type ?? undefined,
        description: a.description ?? undefined,
        creditLine: a.credit_line ?? undefined,
        license: a.license ?? undefined,
        tags: a.tags ?? undefined,
        sourceMuseum: a.source_museum ?? undefined,
        sourceUrl: a.source_url ?? undefined,
        thumb: a.image_thumb_url ?? undefined,
        image: a.image_medium_url ?? a.image_thumb_url ?? undefined,
        note: row.note ?? undefined,
        isFeature: row.section === "feature",
      };
    });

  return (
    <CollectionView
      galleryId={gallery.id}
      initialName={gallery.name}
      initialIsPublic={gallery.is_public ?? false}
      initialSlug={gallery.share_slug ?? null}
      initialGuestbookEnabled={gallery.guestbook_enabled ?? true}
      initialWing={(gallery as { wing: string | null }).wing ?? null}
      initialInMuseum={(gallery as { in_museum: boolean | null }).in_museum ?? true}
      existingWings={wingNames}
      initialPieces={pieces}
    />
  );
}
