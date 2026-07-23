// Resolve the homepage hero artwork on the SERVER so its <img> is in the initial
// HTML and the browser starts loading it immediately (big LCP win vs. the old
// client-side search→detail→image chain). Cached so museum APIs aren't hit on
// every request; rotates every 10 minutes.

import { unstable_cache } from "next/cache";
import { getAdapter } from "@/lib/museums";
import { decodeEntities } from "@/lib/util/text";

export type Hero = {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
  artist?: string;
  dateText?: string;
  thumbnailUrl: string;
  heroImage: string;
  museumLabel: string;
};

// Grand, in-catalog landscapes/cityscapes across the always-on museums.
const HERO_POOL: { museum: string; label: string; q: string }[] = [
  { museum: "met", label: "The Met", q: "Heart of the Andes Church" },
  { museum: "met", label: "The Met", q: "Rocky Mountains Lander's Peak Bierstadt" },
  { museum: "met", label: "The Met", q: "Autumn on the Hudson River Cropsey" },
  { museum: "met", label: "The Met", q: "View from Mount Holyoke Oxbow Cole" },
  { museum: "met", label: "The Met", q: "Gorge in the Mountains Gifford" },
  { museum: "met", label: "The Met", q: "Wheat Field with Cypresses Van Gogh" },
  { museum: "rijks", label: "the Rijksmuseum", q: "Windmill at Wijk bij Duurstede Ruisdael" },
  { museum: "rijks", label: "the Rijksmuseum", q: "river landscape Cuyp" },
  { museum: "artic", label: "the Art Institute of Chicago", q: "Water Lilies Monet" },
  { museum: "artic", label: "the Art Institute of Chicago", q: "Paris Street Rainy Day Caillebotte" },
];

async function resolveHero(): Promise<Hero | null> {
  const start = Math.floor(Math.random() * HERO_POOL.length);
  for (let i = 0; i < HERO_POOL.length; i++) {
    const entry = HERO_POOL[(start + i) % HERO_POOL.length];
    const adapter = getAdapter(entry.museum);
    if (!adapter) continue;
    try {
      const res = await adapter.search({
        query: entry.q,
        filters: {},
        page: 1,
        pageSize: 5,
        hasImage: true,
        openAccessOnly: true,
      });
      const card = res.cards.find((c) => c.thumbnailUrl) ?? res.cards[0];
      if (!card) continue;
      const art = await adapter.getObject(card.museumObjectId);
      // ~800px is plenty for the capped hero display and downloads far faster
      // than the full-res original (helps LCP, especially on mobile).
      const img =
        adapter.getImageUrl(art, 800) || art.sourceImageUrl || card.thumbnailUrl;
      if (!img) continue;
      return {
        sourceMuseum: entry.museum,
        museumObjectId: card.museumObjectId,
        title: decodeEntities(card.title) || "Untitled",
        artist: decodeEntities(card.artist) || undefined,
        dateText: decodeEntities(card.dateText) || undefined,
        thumbnailUrl: card.thumbnailUrl,
        heroImage: img,
        museumLabel: entry.label,
      };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

export const fetchHero = unstable_cache(resolveHero, ["home-hero"], {
  revalidate: 600,
});
