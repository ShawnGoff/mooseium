// lib/museums/artic.ts
// MuseumAdapter for the Art Institute of Chicago.
// Docs: https://api.artic.edu/docs/  |  No API key required.
//
// Notes:
//  - Search returns IDs + pagination; we hydrate a page in one batch call to
//    /artworks?ids=...&fields=... (guarantees full, consistent fields).
//  - Images are true IIIF: `${iiif_url}/${image_id}/full/{width},/0/default.jpg`.
//  - We keep only public-domain works that have an image.

import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const AIC_BASE = "https://api.artic.edu/api/v1";
const FALLBACK_IIIF = "https://www.artic.edu/iiif/2";

const HYDRATE_FIELDS = [
  "id",
  "title",
  "artist_display",
  "date_display",
  "medium_display",
  "dimensions",
  "credit_line",
  "image_id",
  "is_public_domain",
  "classification_title",
  "term_titles",
  "description",
  "thumbnail",
  "date_start",
  "date_end",
  "department_title",
  "place_of_origin",
  "provenance_text",
  "exhibition_history",
  "gallery_title",
  "is_on_view",
  "alt_image_ids",
].join(",");

interface AicThumbnail {
  width?: number;
  height?: number;
  alt_text?: string;
}

interface AicArtwork {
  id: number;
  title: string;
  artist_display?: string;
  date_display?: string;
  medium_display?: string;
  dimensions?: string;
  credit_line?: string;
  image_id?: string | null;
  is_public_domain?: boolean;
  classification_title?: string;
  term_titles?: string[];
  description?: string | null;
  thumbnail?: AicThumbnail | null;
  date_start?: number | null;
  date_end?: number | null;
  department_title?: string | null;
  place_of_origin?: string | null;
  provenance_text?: string | null;
  exhibition_history?: string | null;
  gallery_title?: string | null;
  is_on_view?: boolean;
  alt_image_ids?: string[] | null;
  _iiifBase?: string; // stashed so getImageUrl can build URLs
}

interface AicSearchResponse {
  pagination: {
    total: number;
    limit: number;
    current_page: number;
    total_pages: number;
  };
  data: { id: number }[];
}

interface AicBatchResponse {
  data: AicArtwork[];
  config?: { iiif_url?: string };
}

async function fetchJson<T>(url: string): Promise<T> {
  // Cache upstream museum responses for a day (records are effectively static).
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`AIC API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function firstLine(s?: string): string | undefined {
  if (!s) return undefined;
  const line = s.split("\n")[0].trim();
  return line || undefined;
}

function stripHtml(s?: string | null): string | undefined {
  if (!s) return undefined;
  const text = s.replace(/<[^>]*>/g, "").trim();
  return text || undefined;
}

function normalize(o: AicArtwork): NormalizedArtwork {
  const thumb = o.thumbnail;
  const aspect =
    thumb?.width && thumb?.height ? thumb.width / thumb.height : undefined;
  return {
    sourceMuseum: "artic",
    museumObjectId: String(o.id),
    title: o.title || "Untitled",
    artist: firstLine(o.artist_display),
    dateText: o.date_display || undefined,
    medium: o.medium_display || undefined,
    culture: undefined,
    dimensions: o.dimensions || undefined,
    objectType: o.classification_title || undefined,
    description: stripHtml(o.description),
    creditLine: o.credit_line || undefined,
    tags: (o.term_titles ?? []).filter(Boolean),
    rights: {
      status: o.is_public_domain ? "public_domain" : "unknown",
      license: o.is_public_domain ? "CC0" : undefined,
      attribution: o.credit_line || undefined,
      isOpenAccess: Boolean(o.is_public_domain),
    },
    sourceImageUrl: o.image_id
      ? `${o._iiifBase ?? FALLBACK_IIIF}/${o.image_id}/full/1686,/0/default.jpg`
      : undefined,
    aspectRatio: aspect,
    sourceUrl: `https://www.artic.edu/artworks/${o.id}`,
    details: [
      ["Department", o.department_title],
      ["Origin", o.place_of_origin],
    ]
      .filter(([, v]) => v)
      .map(([label, value]) => ({ label: label as string, value: value as string })),
    provenance: o.provenance_text || undefined,
    artistBio: (o.artist_display?.split("\n").slice(1).join(", ") || undefined),
    additionalImages: (o.alt_image_ids ?? [])
      .filter(Boolean)
      .map((id) => `${o._iiifBase ?? FALLBACK_IIIF}/${id}/full/843,/0/default.jpg`),
    exhibitions: o.exhibition_history
      ? o.exhibition_history.split("\n").map((s) => s.trim()).filter(Boolean)
      : undefined,
    onView: o.is_on_view && o.gallery_title ? o.gallery_title : undefined,
    raw: o,
  };
}

function iiifUrl(o: AicArtwork, width: number): string {
  if (!o.image_id) return "";
  const base = o._iiifBase ?? FALLBACK_IIIF;
  return `${base}/${o.image_id}/full/${Math.round(width)},/0/default.jpg`;
}

function toCard(a: NormalizedArtwork): ArtworkCard {
  const raw = a.raw as AicArtwork;
  return {
    sourceMuseum: a.sourceMuseum,
    museumObjectId: a.museumObjectId,
    title: a.title,
    artist: a.artist,
    dateText: a.dateText,
    thumbnailUrl: iiifUrl(raw, 400),
    objectType: a.objectType,
  };
}

export const articAdapter: MuseumAdapter = {
  slug: "artic",
  displayName: "Art Institute of Chicago",
  requiresApiKey: false,

  getSearchFilters(): FilterField[] {
    return [
      { key: "medium", label: "Medium", type: "text" },
      // Maps to the client-side objectType filter (AIC has no type search param).
      { key: "objectType", label: "Type", type: "text" },
    ];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 24);

    // Optional date-range filter (applied client-side against date_start/date_end).
    let rangeBegin: number | null = null;
    let rangeEnd: number | null = null;
    if (
      typeof params.filters?.dateRange === "string" &&
      params.filters.dateRange.includes(",")
    ) {
      const [b, e] = params.filters.dateRange.split(",");
      rangeBegin = Number(b);
      rangeEnd = Number(e);
    }
    const dateFiltering = rangeBegin !== null && rangeEnd !== null;

    // Fetch a full AIC page (100 ids, hydrated in one batch call) and return all
    // that pass our filters. Each app page maps to one AIC page, so "Load more"
    // paginates without gaps.
    const searchLimit = 100;
    // Bias the keyword toward the requested type (AIC search has no simple
    // classification filter), then still filter exactly after hydrating.
    const qParts = [
      params.query?.trim(),
      params.filters?.objectType ? String(params.filters.objectType) : null,
    ].filter(Boolean) as string[];
    const qs = new URLSearchParams();
    qs.set("q", qParts.join(" "));
    qs.set("page", String(page));
    qs.set("limit", String(searchLimit));
    if (params.filters?.medium) qs.set("query[match][medium_display]", String(params.filters.medium));

    const search = await fetchJson<AicSearchResponse>(
      `${AIC_BASE}/artworks/search?${qs}`
    );
    const ids = search.data.map((d) => d.id);
    if (ids.length === 0) {
      return { cards: [], page, pageSize, total: 0, hasMore: false };
    }

    // Hydrate the page in one batch call.
    const batch = await fetchJson<AicBatchResponse>(
      `${AIC_BASE}/artworks?ids=${ids.join(",")}&fields=${HYDRATE_FIELDS}`
    );
    const iiif = batch.config?.iiif_url ?? FALLBACK_IIIF;

    // The AIC search endpoint has no simple classification filter, so filter
    // type on our side after hydrating.
    const wantType = params.filters?.objectType
      ? String(params.filters.objectType).toLowerCase()
      : null;

    const cards: ArtworkCard[] = [];
    for (const o of batch.data) {
      o._iiifBase = iiif;
      if (params.openAccessOnly !== false && !o.is_public_domain) continue;
      if (params.hasImage !== false && !o.image_id) continue;
      if (
        dateFiltering &&
        typeof o.date_start === "number" &&
        typeof o.date_end === "number"
      ) {
        // Keep pieces whose date span overlaps the requested range.
        if (!(o.date_start <= rangeEnd! && o.date_end >= rangeBegin!)) continue;
      }
      if (wantType) {
        const a = (o.classification_title ?? "").toLowerCase();
        if (!(a === wantType || a.includes(wantType) || wantType.includes(a))) continue;
      }
      cards.push(toCard(normalize(o)));
    }

    return {
      cards,
      page,
      pageSize,
      total: search.pagination.total,
      hasMore: search.pagination.current_page < search.pagination.total_pages,
    };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const res = await fetchJson<{ data: AicArtwork; config?: { iiif_url?: string } }>(
      `${AIC_BASE}/artworks/${museumObjectId}?fields=${HYDRATE_FIELDS}`
    );
    const o = res.data;
    o._iiifBase = res.config?.iiif_url ?? FALLBACK_IIIF;
    return normalize(o);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    return iiifUrl(artwork.raw as AicArtwork, targetWidth);
  },
};
