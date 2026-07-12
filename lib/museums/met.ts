// lib/museums/met.ts
// Concrete MuseumAdapter for The Metropolitan Museum of Art.
// Docs: https://metmuseum.github.io/  |  No API key required.
//
// Quirks handled here so the rest of the app never sees them:
//  - Search returns only object IDs -> we hydrate a page of IDs into full cards.
//  - The Met can't resize on demand: it exposes two fixed image URLs
//    (primaryImageSmall, primaryImage). getImageUrl picks the best fit; our
//    save pipeline downsizes from the full image itself.

import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const MET_BASE = "https://collectionapi.metmuseum.org/public/collection/v1";
const SMALL_MAX_WIDTH = 800; // Met's primaryImageSmall ("web-large") is roughly this wide

interface MetObject {
  objectID: number;
  isPublicDomain: boolean;
  primaryImage: string;
  primaryImageSmall: string;
  title: string;
  artistDisplayName: string;
  objectDate: string;
  medium: string;
  dimensions: string;
  culture: string;
  creditLine: string;
  classification: string;
  objectURL: string;
  tags: { term: string }[] | null;
  department: string;
  period: string;
  accessionNumber: string;
  country: string;
  region: string;
  artistDisplayBio: string;
  additionalImages: string[];
  GalleryNumber: string;
}

function buildDetails(o: MetObject): { label: string; value: string }[] {
  const rows: [string, string | undefined][] = [
    ["Department", o.department],
    ["Period", o.period],
    ["Origin", o.country || o.region],
    ["Accession", o.accessionNumber],
  ];
  return rows
    .filter(([, v]) => v)
    .map(([label, value]) => ({ label, value: value as string }));
}

interface MetSearchResponse {
  total: number;
  objectIDs: number[] | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  // Museum records are effectively static — cache upstream responses for a day
  // so repeat discovery/hydration views don't re-hit the museum API.
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Met API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// Run async work over items with a small concurrency cap (be kind to the API).
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function normalize(o: MetObject): NormalizedArtwork {
  return {
    sourceMuseum: "met",
    museumObjectId: String(o.objectID),
    title: o.title || "Untitled",
    artist: o.artistDisplayName || undefined,
    dateText: o.objectDate || undefined,
    medium: o.medium || undefined,
    culture: o.culture || undefined,
    dimensions: o.dimensions || undefined,
    objectType: o.classification || undefined,
    description: undefined, // the Met's public API has no narrative description
    creditLine: o.creditLine || undefined,
    tags: (o.tags ?? []).map((t) => t.term).filter(Boolean),
    rights: {
      status: o.isPublicDomain ? "public_domain" : "unknown",
      license: o.isPublicDomain ? "CC0" : undefined,
      attribution: o.creditLine || undefined,
      isOpenAccess: Boolean(o.isPublicDomain),
    },
    sourceImageUrl: o.primaryImage || o.primaryImageSmall || undefined,
    aspectRatio: undefined, // computed from the downloaded image by the pipeline
    sourceUrl: o.objectURL || undefined,
    details: buildDetails(o),
    artistBio: o.artistDisplayBio || undefined,
    additionalImages: (o.additionalImages ?? []).filter(Boolean),
    onView: o.GalleryNumber ? `Gallery ${o.GalleryNumber}` : undefined,
    raw: o,
  };
}

function toCard(a: NormalizedArtwork): ArtworkCard {
  const raw = a.raw as MetObject;
  return {
    sourceMuseum: a.sourceMuseum,
    museumObjectId: a.museumObjectId,
    title: a.title,
    artist: a.artist,
    dateText: a.dateText,
    thumbnailUrl: raw.primaryImageSmall || raw.primaryImage,
    objectType: a.objectType,
  };
}

export const metAdapter: MuseumAdapter = {
  slug: "met",
  displayName: "The Metropolitan Museum of Art",
  requiresApiKey: false,

  getSearchFilters(): FilterField[] {
    return [
      { key: "dateRange", label: "Date range", type: "dateRange" },
      { key: "medium", label: "Medium", type: "text" },
      { key: "geoLocation", label: "Place", type: "text" },
      { key: "isHighlight", label: "Highlights only", type: "boolean" },
      { key: "isOnView", label: "On view only", type: "boolean" },
    ];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 20);
    const filters = params.filters ?? {};

    // Bias the keyword toward the requested type so type filtering actually
    // surfaces that type (the Met has no classification search param).
    const qParts = [params.query?.trim(), filters.objectType ? String(filters.objectType) : null].filter(
      Boolean
    ) as string[];
    const qs = new URLSearchParams();
    qs.set("q", qParts.join(" ") || "*");
    if (params.hasImage !== false) qs.set("hasImages", "true");
    if (filters.medium) qs.set("medium", String(filters.medium));
    if (filters.geoLocation) qs.set("geoLocation", String(filters.geoLocation));
    if (filters.isHighlight) qs.set("isHighlight", "true");
    if (filters.isOnView) qs.set("isOnView", "true");
    if (typeof filters.dateRange === "string" && filters.dateRange.includes(",")) {
      const [begin, end] = filters.dateRange.split(",");
      if (begin && end) {
        qs.set("dateBegin", begin);
        qs.set("dateEnd", end);
      }
    }

    const search = await fetchJson<MetSearchResponse>(`${MET_BASE}/search?${qs}`);
    const allIds = search.objectIDs ?? [];
    const total = allIds.length;

    const start = (page - 1) * pageSize;
    const pageIds = allIds.slice(start, start + pageSize);

    // The Met has no classification search param, so filter type on our side.
    const wantType = filters.objectType
      ? String(filters.objectType).toLowerCase()
      : null;

    const hydrated = await mapLimit(pageIds, 6, async (id) => {
      try {
        const obj = await fetchJson<MetObject>(`${MET_BASE}/objects/${id}`);
        const art = normalize(obj);
        if (params.openAccessOnly !== false && !art.rights.isOpenAccess) return null;
        if (!art.sourceImageUrl) return null;
        if (wantType) {
          const a = (art.objectType ?? "").toLowerCase();
          if (!(a === wantType || a.includes(wantType) || wantType.includes(a)))
            return null;
        }
        return toCard(art);
      } catch {
        return null; // skip individual failures rather than failing the page
      }
    });

    const cards = hydrated.filter((c): c is ArtworkCard => c !== null);

    return { cards, page, pageSize, total, hasMore: start + pageSize < total };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const obj = await fetchJson<MetObject>(`${MET_BASE}/objects/${museumObjectId}`);
    return normalize(obj);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    const raw = artwork.raw as MetObject;
    const small = raw?.primaryImageSmall;
    const full = raw?.primaryImage || artwork.sourceImageUrl || "";
    if (targetWidth <= SMALL_MAX_WIDTH && small) return small;
    return full || small || "";
  },
};
