// /museums/[slug] — per-museum discovery feed. Server-rendered so the category
// rows are in the initial HTML (crawlable, no "Loading…" shell), with a client
// child (MuseumFeed) adding placard/save interactivity.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdapter, listMuseums } from "@/lib/museums";
import { decodeEntities } from "@/lib/util/text";
import MuseumFeed, { type FeedCard, type FeedRow } from "./MuseumFeed";

// Regenerate at most hourly; museum content is effectively static.
export const revalidate = 3600;

// Subject-based rows shown for every museum.
const CATEGORIES = [
  "Landscapes",
  "Portraits",
  "Still life",
  "Mythology",
  "Animals",
  "Flowers",
  "Architecture",
  "Seascapes",
];

// Museums that flag their own highlights get a special first row.
const HIGHLIGHT_QUERY: Record<string, { q: string; note: string }> = {
  met: {
    q: "painting",
    note: "Flagged by the Met as highlights of its collection.",
  },
};

function museumFor(slug: string) {
  return listMuseums().find((m) => m.slug === slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const museum = museumFor(slug);
  if (!museum) return { title: "Museum not found" };
  const description = `Explore ${museum.displayName}'s open-access collection on Mooseium — landscapes, portraits, mythology, and more, saved into your own galleries.`;
  return {
    title: museum.displayName,
    description,
    alternates: { canonical: `/museums/${slug}` },
    openGraph: { title: `${museum.displayName} · Mooseium`, description },
    twitter: {
      card: "summary_large_image",
      title: `${museum.displayName} · Mooseium`,
      description,
    },
  };
}

async function buildRow(
  slug: string,
  key: string,
  title: string,
  q: string,
  extra: string,
  note?: string
): Promise<FeedRow | null> {
  const adapter = getAdapter(slug);
  if (!adapter) return null;
  const filters: Record<string, string> = {};
  if (extra) {
    const [k, v] = extra.split("=");
    filters[k] = v;
  }
  try {
    const result = await adapter.search({
      query: q,
      filters,
      page: 1,
      pageSize: 12,
      hasImage: true,
      openAccessOnly: true,
    });
    const cards: FeedCard[] = result.cards
      .filter((c) => c.thumbnailUrl)
      .map((c) => ({
        sourceMuseum: c.sourceMuseum,
        museumObjectId: c.museumObjectId,
        title: decodeEntities(c.title),
        artist: decodeEntities(c.artist),
        dateText: decodeEntities(c.dateText),
        objectType: decodeEntities(c.objectType),
        thumbnailUrl: c.thumbnailUrl,
      }));
    if (cards.length === 0) return null;
    const href = `/?museum=${slug}&q=${encodeURIComponent(q)}${
      extra ? `&${extra}` : ""
    }`;
    return { key, title, note, href, cards };
  } catch {
    return null;
  }
}

export default async function MuseumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const museum = museumFor(slug);
  if (!museum) notFound();

  const jobs: Promise<FeedRow | null>[] = [];
  const hi = HIGHLIGHT_QUERY[slug];
  if (hi) {
    jobs.push(buildRow(slug, "0-highlights", "Museum highlights", hi.q, "isHighlight=true", hi.note));
  }
  CATEGORIES.forEach((cat, i) => jobs.push(buildRow(slug, `${i + 1}-${cat}`, cat, cat, "")));

  const rows = (await Promise.all(jobs))
    .filter((r): r is FeedRow => r !== null)
    .sort((a, b) => rowOrder(a.key) - rowOrder(b.key));

  return <MuseumFeed displayName={museum.displayName} rows={rows} />;
}

function rowOrder(key: string): number {
  const n = parseInt(key.split("-")[0], 10);
  return Number.isNaN(n) ? 99 : n;
}
