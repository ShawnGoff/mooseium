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
// Search moved to v1.1 when the Met retired /v1/search on 2026-10-01 — the old
// path now answers 410 Gone, which broke every Met search: the museum's own
// search, its source-museum rooms, the homepage theme cards, and the Met share
// of the daily discovery shelves. Object lookups stay on v1, which is untouched.
//
// The difference that matters: /v1/search was Solr-backed and returned EVERY
// matching id in one response, so paging was a local slice. v1.1 is Elastic and
// pages server-side via offset/limit, reporting `total` itself — so we ask for
// the page we want instead of asking for everything and cutting it up.
const MET_SEARCH_BASE =
  "https://collectionapi.metmuseum.org/public/collection/v1.1";
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

    // Ask for exactly this page. The old endpoint handed back the entire result
    // set — tens of thousands of ids for a broad term like "landscape" — and we
    // sliced it; v1.1 does that server-side.
    // Ask for MORE ids than the page needs. Plenty of matches are dropped during
    // hydration — not open access, or no usable image — and the Met counts them
    // as matches anyway, so a page of ids can hydrate to nothing. "flowers"
    // returned six ids and zero usable cards, which is why that theme card was
    // blank while its neighbours were fine. Each page consumes a whole window, so
    // windows never overlap and pages stay distinct.
    const OVERFETCH = 3;
    const windowSize = pageSize * OVERFETCH;
    const start = (page - 1) * windowSize;
    qs.set("limit", String(windowSize));
    qs.set("offset", String(start));

    const search = await fetchJson<MetSearchResponse>(
      `${MET_SEARCH_BASE}/search?${qs}`
    );
    const windowIds = search.objectIDs ?? [];
    // `total` is now the match count the Met reports, not the length of what it
    // returned — those were the same thing before and are not any more.
    const total = search.total ?? windowIds.length;

    // The Met has no classification search param, so filter type on our side.
    const wantType = filters.objectType
      ? String(filters.objectType).toLowerCase()
      : null;

    const hydrateOne = async (id: number) => {
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
    };

    // Hydrate a chunk at a time and stop as soon as the page is full, so the
    // common case still costs pageSize lookups rather than three times that.
    const cards: ArtworkCard[] = [];
    for (let i = 0; i < windowIds.length && cards.length < pageSize; i += pageSize) {
      const hydrated = await mapLimit(windowIds.slice(i, i + pageSize), 6, hydrateOne);
      for (const c of hydrated) if (c) cards.push(c);
    }
    cards.length = Math.min(cards.length, pageSize);

    // Measure "is there another page" against what the Met actually returned,
    // not against pageSize: on the last page it returns fewer ids than asked,
    // and start + pageSize could otherwise claim a page that does not exist.
    return {
      cards,
      page,
      pageSize,
      total,
      hasMore: start + windowIds.length < total,
    };
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
