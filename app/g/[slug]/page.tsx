// /g/[slug] — public read-only view of a shared gallery.

import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import { safeJsonLd } from "@/lib/jsonld";
import GalleryView, { type GalleryPiece } from "./GalleryView";
import { type GuestEntry } from "./GuestBook";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

// Open Graph / Twitter preview so a pasted gallery link shows the cover art,
// title, and curator instead of a bare URL.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();

  const { data: gallery } = await supabase
    .from("galleries")
    .select(
      "name, profiles!galleries_user_id_fkey(display_name), placed_artworks(sort_order, section, artworks(image_medium_url, image_thumb_url))"
    )
    .eq("share_slug", slug)
    .eq("is_public", true)
    .single<{
      name: string;
      profiles: { display_name: string | null } | null;
      placed_artworks: {
        sort_order: number;
        section: string | null;
        artworks: {
          image_medium_url: string | null;
          image_thumb_url: string | null;
        } | null;
      }[];
    }>();

  if (!gallery) {
    // Missing/private galleries shouldn't be indexed under this URL.
    return { title: "Gallery not available", robots: { index: false } };
  }

  const curator = gallery.profiles?.display_name;
  // The root layout's title template appends "· Mooseium".
  const title = gallery.name;
  const ogTitle = `${gallery.name} · Mooseium`;
  const description = curator
    ? `A gallery curated by ${curator} on Mooseium — art from the world's great museums.`
    : "A gallery on Mooseium — art from the world's great museums.";

  // The og:image / twitter:image come from opengraph-image.tsx in this folder,
  // which embeds the art (fetched with browser headers) so museum-CDN hotlink
  // protection can't 403 the preview. We only set title/description here.
  return {
    title,
    description,
    alternates: { canonical: `/g/${slug}` },
    openGraph: { title: ogTitle, description, type: "website" },
    twitter: { card: "summary_large_image", title: ogTitle, description },
  };
}

type GalleryRow = {
  id: string;
  name: string;
  user_id: string;
  guestbook_enabled: boolean;
  profiles: { display_name: string | null; username: string | null } | null;
};

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
    aspect_ratio: number | null;
  } | null;
};

function NotAvailable() {
  return (
    <main className="container">
      <h1>Gallery not available</h1>
      <p className="status">
        This gallery is private or doesn&apos;t exist. <Link href="/">Go home</Link>.
      </p>
    </main>
  );
}

export default async function SharedGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isSupabaseConfigured()) return <NotAvailable />;

  const supabase = await createClient();

  const { data: gallery, error: galleryError } = await supabase
    .from("galleries")
    .select(
      "id, name, user_id, guestbook_enabled, profiles!galleries_user_id_fkey(display_name, username)"
    )
    .eq("share_slug", slug)
    .eq("is_public", true)
    .single<GalleryRow>();

  if (galleryError) {
    console.error("[/g/[slug]] gallery query failed:", slug, galleryError.message);
  }

  if (!gallery) return <NotAvailable />;

  // The owner viewing their own shared gallery can edit notes.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const editable = user?.id === gallery.user_id;
  const canSaveGallery = Boolean(user) && !editable;

  let savedByViewer = false;
  if (canSaveGallery && user) {
    const { data: sg } = await supabase
      .from("saved_galleries")
      .select("gallery_id")
      .eq("user_id", user.id)
      .eq("gallery_id", gallery.id)
      .maybeSingle();
    savedByViewer = Boolean(sg);
  }

  const { data } = await supabase
    .from("placed_artworks")
    .select(
      "sort_order, section, note, artworks(id, source_museum, museum_object_id, title, artist, date_text, medium, culture, dimensions, object_type, description, credit_line, license, tags, source_url, image_medium_url, image_thumb_url, aspect_ratio)"
    )
    .eq("gallery_id", gallery.id)
    .order("sort_order", { ascending: true });

  const pieces: GalleryPiece[] = ((data as PlacedRow[] | null) ?? [])
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
        image: a.image_medium_url ?? a.image_thumb_url ?? undefined,
        note: row.note ?? undefined,
        isFeature: row.section === "feature",
      };
    });

  const { data: gb } = await supabase
    .from("guestbook_entries")
    .select("user_id, display_name, message, owner_reply, created_at, profiles(username)")
    .eq("gallery_id", gallery.id)
    .order("created_at", { ascending: false });

  const guestbook: GuestEntry[] = (
    (gb as
      | {
          user_id: string;
          display_name: string | null;
          message: string | null;
          owner_reply: string | null;
          created_at: string;
          profiles: { username: string | null } | null;
        }[]
      | null) ?? []
  ).map((g) => ({
    userId: g.user_id,
    displayName: g.display_name ?? "A visitor",
    handle: g.profiles?.username ?? undefined,
    message: g.message ?? undefined,
    ownerReply: g.owner_reply ?? undefined,
    createdAt: g.created_at,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: gallery.name,
    url: `${SITE_URL}/g/${slug}`,
    isPartOf: { "@id": `${SITE_URL}/#website` },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Galleries", item: `${SITE_URL}/galleries` },
        { "@type": "ListItem", position: 3, name: gallery.name },
      ],
    },
    ...(gallery.profiles?.display_name
      ? {
          author: {
            "@type": "Person",
            name: gallery.profiles.display_name,
            ...(gallery.profiles.username
              ? { url: `${SITE_URL}/@${gallery.profiles.username}` }
              : {}),
          },
        }
      : {}),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: pieces.length,
      itemListElement: pieces.slice(0, 50).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "VisualArtwork",
          name: p.title,
          ...(p.artist ? { creator: { "@type": "Person", name: p.artist } } : {}),
          ...(p.dateText ? { dateCreated: p.dateText } : {}),
          ...(p.image ? { image: p.image } : {}),
        },
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <GalleryView
        galleryId={gallery.id}
        name={gallery.name}
        curator={gallery.profiles?.display_name ?? undefined}
        curatorHandle={gallery.profiles?.username ?? undefined}
        editable={editable}
        pieces={pieces}
        guestbook={guestbook}
        guestbookEnabled={gallery.guestbook_enabled}
        viewerId={user?.id}
        signedIn={Boolean(user)}
        canSaveGallery={canSaveGallery}
        savedByViewer={savedByViewer}
      />
    </>
  );
}
