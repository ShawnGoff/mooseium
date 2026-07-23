// lib/museums/index.ts
// Adapter registry. The app looks museums up by slug and never imports a
// specific museum directly. Add a museum later by writing its adapter and
// registering it here.

import type { MuseumAdapter, MuseumRegistry } from "./types";
import { cleanProse } from "@/lib/util/text";
import { metAdapter } from "./met";
import { articAdapter } from "./artic";
import { clevelandAdapter } from "./cleveland";
import { rijksmuseumAdapter } from "./rijksmuseum";
import { vamAdapter } from "./vam";
import { harvardAdapter } from "./harvard";
import { smithsonianAdapter } from "./smithsonian";

// No-key museums are always available (Rijksmuseum's new Search API is keyless).
export const registry: MuseumRegistry = {
  [metAdapter.slug]: metAdapter,
  [articAdapter.slug]: articAdapter,
  [clevelandAdapter.slug]: clevelandAdapter,
  [rijksmuseumAdapter.slug]: rijksmuseumAdapter,
};

// V&A is built but not yet verified against the live API, so it's off by default.
// Set ENABLE_VAM=1 (env) once /museums/vam is confirmed working to switch it on
// everywhere (dropdown, museums index, cross-museum search).
if (process.env.ENABLE_VAM) {
  registry[vamAdapter.slug] = vamAdapter;
}

// Key-based museums only appear when their API key is configured, so the
// dropdown never offers a museum that can't actually be queried.
if (process.env.HARVARD_API_KEY) {
  registry[harvardAdapter.slug] = harvardAdapter;
}
if (process.env.SMITHSONIAN_API_KEY) {
  registry[smithsonianAdapter.slug] = smithsonianAdapter;
}

// Some feeds (notably the Met) leave HTML markup in titles — e.g.
// "<em>Sib</em> sphinx for a barque". Sanitize every title on the way out of an
// adapter so ONE fix covers the placard, /art pages, cards, OG tags and JSON-LD.
// Methods are delegated to the real adapter (never spread) so their internal
// `this` stays intact.
function sanitizeAdapter(a: MuseumAdapter): MuseumAdapter {
  return {
    slug: a.slug,
    displayName: a.displayName,
    requiresApiKey: a.requiresApiKey,
    getSearchFilters: () => a.getSearchFilters(),
    async search(params) {
      const r = await a.search(params);
      return {
        ...r,
        cards: r.cards.map((c) => ({ ...c, title: cleanProse(c.title) })),
      };
    },
    async getObject(id) {
      const o = await a.getObject(id);
      return { ...o, title: cleanProse(o.title) };
    },
    getImageUrl: (art, w) => a.getImageUrl(art, w),
  };
}

export function getAdapter(slug: string): MuseumAdapter | undefined {
  const a = registry[slug];
  return a ? sanitizeAdapter(a) : undefined;
}

/** Lightweight museum list for the search dropdown. */
export function listMuseums() {
  return Object.values(registry).map((m) => ({
    slug: m.slug,
    displayName: m.displayName,
    filters: m.getSearchFilters(),
  }));
}

export * from "./types";
