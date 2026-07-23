// / — home. The interactive experience lives in HomeClient (a client
// component); this server wrapper owns the page metadata so the home page gets
// a canonical URL and search-friendly title/description.

import type { Metadata } from "next";
import HomeClient from "./HomeClient";
import { fetchHero } from "@/lib/hero";

export const metadata: Metadata = {
  // Home keeps the site-level default title from the root layout.
  description:
    "Search open-access masterpieces from The Met, Art Institute of Chicago, Cleveland, the Rijksmuseum, Harvard, and the Smithsonian — save the pieces you love, curate shareable galleries, and walk your own 3D museum.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Resolved + cached on the server so the hero image is in the initial HTML.
  const initialHero = await fetchHero();
  return <HomeClient initialHero={initialHero} />;
}
