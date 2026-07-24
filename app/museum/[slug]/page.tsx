// /museum/[slug] — a pre-populated 3D showcase built from ONE institution's own
// open-access art (e.g. /museum/met). These live under /museum/* — NOT under an
// @handle — so they never squat a username a real institution might want.
//
// Read-only: no editor, no placements. The gallery pieces are baked in by
// /api/source-museum (cached weekly).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdapter } from "@/lib/museums";
import MuseumClient from "../../lab/museum/MuseumClient";

function museumName(slug: string): string | null {
  const a = getAdapter(slug);
  return a ? a.displayName : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = museumName(slug.toLowerCase());
  if (!name) return { title: "Museum not found" };
  const title = `${name} · 3D`;
  const description = `Walk through a 3D gallery of open-access art from ${name}, arranged into themed wings on Mooseium.`;
  return {
    title,
    description,
    alternates: { canonical: `/museum/${slug.toLowerCase()}` },
    openGraph: { title: `${title} · Mooseium`, description, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} · Mooseium`, description },
  };
}

export default async function SourceMuseumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const s = slug.toLowerCase();
  if (!museumName(s)) notFound();
  return <MuseumClient source={s} />;
}
