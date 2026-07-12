// lib/museums/vam.ts
// MuseumAdapter for the Victoria and Albert Museum (London).
// Docs: https://developers.vam.ac.uk/guide/v2/  |  No API key required.
//
// Notes:
//  - Search returns records with a primary image id; images are IIIF via
//    framemark.vam.ac.uk: `.../collections/{imageId}/full/{width},/0/default.jpg`.
//  - Object detail comes from /v2/museumobject/{systemNumber}.
//  - The V&A's image-rights signal isn't a clean CC0 flag in the API, so we mark
//    rights as "unknown" and gate on image presence (like Harvard). Tighten this
//    once the exact open-access field is confirmed against the live API.

import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const VAM_BASE = "https://api.vam.ac.uk/v2";
const IIIF_BASE = "https://framemark.vam.ac.uk/collections";

interface VamSearchRecord {
  systemNumber: string;
  objectType?: string;
  _primaryTitle?: string;
  _primaryMaker?: { name?: string; association?: string };
  _primaryDate?: string;
  _primaryImageId?: string;
}

interface VamSearchResponse {
  info?: { record_count?: number; pages?: number; page?: number; page_size?: number };
  records?: VamSearchRecord[];
}

interface VamObjectRecord {
  systemNumber: string;
  accessionNumber?: string;
  objectType?: string;
  _primaryTitle?: string;
  _primaryDate?: string;
  _primaryImageId?: string;
  titles?: { title?: string }[];
  briefDescription?: string;
  summaryDescription?: string;
  physicalDescription?: string;
  materialsAndTechniques?: string;
  artistMakerPerson?: { name?: { text?: string } }[];
  productionDates?: { date?: { text?: string } }[];
  placesOfOrigin?: { place?: { text?: string } }[];
  categories?: { text?: string }[];
  dimensions?: { dimension?: string; value?: string; unit?: string }[];
  galleryLocations?: { current?: { text?: string } }[];
  images?: string[];
  creditLine?: string;
  briefDescription_?: string;
}

interface VamObjectResponse {
  record?: VamObjectRecord;
}

async function fetchJson<T>(url: string): Promise<T> {
  // Cache upstream museum responses for a day (records are effectively static).
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`V&A API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function stripHtml(s?: string | null): string | undefined {
  if (!s) return undefined;
  const text = s.replace(/<[^>]*>/g, "").trim();
  return text || undefined;
}

function vamImage(imageId: string | undefined, width: number): string {
  if (!imageId) return "";
  return `${IIIF_BASE}/${imageId}/full/${Math.round(width)},/0/default.jpg`;
}

function cardFromSearch(r: VamSearchRecord): ArtworkCard | null {
  if (!r._primaryImageId) return null;
  return {
    sourceMuseum: "vam",
    museumObjectId: r.systemNumber,
    title: r._primaryTitle || "Untitled",
    artist: r._primaryMaker?.name || undefined,
    dateText: r._primaryDate || undefined,
    thumbnailUrl: vamImage(r._primaryImageId, 400),
    objectType: r.objectType || undefined,
  };
}

function normalize(rec: VamObjectRecord): NormalizedArtwork {
  const imageId = rec._primaryImageId || rec.images?.[0];
  const dims = (rec.dimensions ?? [])
    .filter((d) => d.dimension && d.value)
    .map((d) => `${d.dimension}: ${d.value}${d.unit ? " " + d.unit : ""}`)
    .join(", ");
  return {
    sourceMuseum: "vam",
    museumObjectId: rec.systemNumber,
    title: rec._primaryTitle || rec.titles?.[0]?.title || "Untitled",
    artist: rec.artistMakerPerson?.[0]?.name?.text || undefined,
    dateText: rec._primaryDate || rec.productionDates?.[0]?.date?.text || undefined,
    medium: rec.materialsAndTechniques || undefined,
    culture: rec.placesOfOrigin?.[0]?.place?.text || undefined,
    dimensions: dims || undefined,
    objectType: rec.objectType || undefined,
    description: stripHtml(rec.summaryDescription || rec.briefDescription),
    creditLine: rec.creditLine || undefined,
    tags: (rec.categories ?? [])
      .map((c) => c.text)
      .filter((t): t is string => Boolean(t))
      .slice(0, 15),
    rights: {
      status: "unknown",
      attribution: "Victoria and Albert Museum, London",
      isOpenAccess: Boolean(imageId),
    },
    sourceImageUrl: vamImage(imageId, 2048) || undefined,
    aspectRatio: undefined,
    sourceUrl: `https://collections.vam.ac.uk/item/${rec.systemNumber}`,
    details: [
      ["Accession", rec.accessionNumber],
      ["Physical description", stripHtml(rec.physicalDescription)],
    ]
      .filter(([, v]) => v)
      .map(([label, value]) => ({ label: label as string, value: value as string })),
    onView: rec.galleryLocations?.[0]?.current?.text || undefined,
    additionalImages: (rec.images ?? [])
      .filter((id) => id && id !== imageId)
      .slice(0, 6)
      .map((id) => vamImage(id, 843)),
    raw: { imageId },
  };
}

export const vamAdapter: MuseumAdapter = {
  slug: "vam",
  displayName: "Victoria and Albert Museum",
  requiresApiKey: false,

  getSearchFilters(): FilterField[] {
    // Kept minimal until the exact V&A facet parameter names are verified live.
    return [];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(1, params.pageSize ?? 24), 100);

    const qs = new URLSearchParams();
    if (params.query?.trim()) qs.set("q", params.query.trim());
    qs.set("page", String(page));
    qs.set("page_size", String(pageSize));
    if (params.hasImage !== false) qs.set("images_exist", "1");

    const data = await fetchJson<VamSearchResponse>(
      `${VAM_BASE}/objects/search?${qs}`
    );

    const cards: ArtworkCard[] = (data.records ?? [])
      .map(cardFromSearch)
      .filter((c): c is ArtworkCard => c !== null);

    const pages = data.info?.pages ?? page;
    return {
      cards,
      page,
      pageSize,
      total: data.info?.record_count,
      hasMore: page < pages,
    };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const data = await fetchJson<VamObjectResponse>(
      `${VAM_BASE}/museumobject/${museumObjectId}`
    );
    if (!data.record) throw new Error(`V&A object ${museumObjectId} not found`);
    return normalize(data.record);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    const imageId = (artwork.raw as { imageId?: string })?.imageId;
    return vamImage(imageId, targetWidth);
  },
};
