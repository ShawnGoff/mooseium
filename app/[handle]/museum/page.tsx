// /@handle/museum — a curator's public 3D museum (walk-through). Shareable,
// indexable route that renders the same 3D experience as the lab page.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import MuseumClient from "../../lab/museum/MuseumClient";

type ProfileRow = {
  display_name: string | null;
  username: string | null;
  museum_name: string | null;
};

async function getProfile(handle: string): Promise<ProfileRow | null> {
  const decoded = decodeURIComponent(handle);
  if (!decoded.startsWith("@") || !isSupabaseConfigured()) return null;
  const username = decoded.slice(1).toLowerCase();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, username, museum_name")
    .eq("username", username)
    .single<ProfileRow>();
  return data ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfile(handle);
  if (!profile) return { title: "Museum not found" };
  const curator = profile.display_name || `@${profile.username}`;
  const museumName = profile.museum_name || `${curator}'s Museum`;
  const title = `${museumName} · 3D`;
  const description = `Walk through ${museumName}, a 3D virtual gallery curated by ${curator} on Mooseium.`;
  return {
    title,
    description,
    alternates: { canonical: `/@${profile.username}/museum` },
    openGraph: { title: `${title} · Mooseium`, description, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} · Mooseium`, description },
  };
}

export default async function CuratorMuseumPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const decoded = decodeURIComponent(handle);
  if (!decoded.startsWith("@")) notFound();
  const profile = await getProfile(handle);
  if (!profile || !profile.username) notFound();

  // Only the owner sees their private Den (furniture + stations). Visitors get
  // the museum without it. (The Den's data is already sealed by RLS regardless.)
  let isOwner = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: me } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .single<{ username: string | null }>();
      isOwner = !!me?.username && me.username === profile.username;
    }
  }

  return <MuseumClient handle={profile.username} isOwner={isOwner} />;
}
