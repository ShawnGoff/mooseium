// lib/museums/cleveland.ts
// MuseumAdapter for the Cleveland Museum of Art (Open Access).
// Docs: https://openaccess-api.clevelandart.org/  |  No API key required.
//
// Notes:
//  - Search returns full records directly (no hydrate step needed).
//  - `cc0=1` and `has_image=1` filter to open works with images at the source.
//  - Images come in web / print / full sizes; `full` is a huge TIFF, so we treat
//    `print` (a large JPEG) as the source and `web` as the thumbnail.

import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const CMA_BASE = "https://openaccess-api.clevelandart.org/api/artworks";
const WEB_MAX_WIDTH = 900; // Cleveland "web" images are ~720-1000px wide

interface CmaImageVariant {
  url: string;
  width?: string;
  height?: string;
}

interface CmaArtwork {
  id: number;
  title: string;
  creation_date?: string;
  creators?: { description?: string; biography?: string }[];
  type?: string;
  technique?: string;
  culture?: string[];
  description?: string | null;
  did_you_know?: string | null;
  creditline?: string;
  measurements?: string;
  share_license_status?: string;
  department?: string;
  collection?: string;
  current_location?: string | null;
  provenance?: { description?: string }[];
  exhibitions?: {
    current?: { title?: string }[];
    legacy?: { title?: string }[];
  };
  alternate_images?: { web?: CmaImageVariant }[];
  url?: string;
  images?: {
    web?: CmaImageVariant;
    print?: CmaImageVariant;
    full?: CmaImageVariant;
  };
}

interface CmaSearchResponse {
  info: { total: number };
  data: CmaArtwork[];
}

async function fetchJson<T>(url: string): Promise<T> {
  // Cache upstream museum responses for a day (records are effectively static).
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Cleveland API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function artistName(o: CmaArtwork): string | undefined {
  const desc = o.creators?.[0]?.description;
  if (!desc) return undefined;
  // "Claude Monet (French, 1840–1926)" -> "Claude Monet"
  return desc.split(" (")[0].trim() || desc;
}

function aspectFrom(v?: CmaImageVariant): number | undefined {
  const w = v?.width ? Number(v.width) : undefined;
  const h = v?.height ? Number(v.height) : undefined;
  return w && h ? w / h : undefined;
}

function normalize(o: CmaArtwork): NormalizedArtwork {
  const cc0 = (o.share_license_status ?? "").toUpperCase() === "CC0";
  return {
    sourceMuseum: "cleveland",
    museumObjectId: String(o.id),
    title: o.title || "Untitled",
    artist: artistName(o),
    dateText: o.creation_date || undefined,
    medium: o.technique || undefined,
    culture: o.culture?.[0] || undefined,
    dimensions: o.measurements || undefined,
    objectType: o.type || undefined,
    description: o.description || undefined,
    creditLine: o.creditline || undefined,
    tags: (o.culture ?? []).filter(Boolean),
    rights: {
      status: cc0 ? "cc0" : "unknown",
      license: cc0 ? "CC0" : undefined,
      attribution: o.creditline || undefined,
      isOpenAccess: cc0,
    },
    // Prefer the large JPEG (print) as our source; avoid the ~500MB full TIFF.
    sourceImageUrl: o.images?.print?.url || o.images?.web?.url || undefined,
    aspectRatio: aspectFrom(o.images?.web) || aspectFrom(o.images?.print),
    sourceUrl: o.url || undefined,
    details: [
      ["Department", o.department],
      ["Collection", o.collection],
    ]
      .filter(([, v]) => v)
      .map(([label, value]) => ({ label: label as string, value: value as string })),
    provenance:
      (o.provenance ?? [])
        .map((p) => p.description)
        .filter(Boolean)
        .join("\n") || undefined,
    funFact: o.did_you_know || undefined,
    artistBio: o.creators?.[0]?.biography || undefined,
    additionalImages: (o.alternate_images ?? [])
      .map((a) => a.web?.url)
      .filter((u): u is string => Boolean(u)),
    exhibitions: [
      ...(o.exhibitions?.current ?? []),
      ...(o.exhibitions?.legacy ?? []),
    ]
      .map((e) => e.title)
      .filter((t): t is string => Boolean(t)),
    onView: o.current_location || undefined,
    raw: o,
  };
}

function toCard(a: NormalizedArtwork): ArtworkCard {
  const raw = a.raw as CmaArtwork;
  return {
    sourceMuseum: a.sourceMuseum,
    museumObjectId: a.museumObjectId,
    title: a.title,
    artist: a.artist,
    dateText: a.dateText,
    thumbnailUrl: raw.images?.web?.url || raw.images?.print?.url || "",
    objectType: a.objectType,
  };
}

export const clevelandAdapter: MuseumAdapter = {
  slug: "cleveland",
  displayName: "Cleveland Museum of Art",
  requiresApiKey: false,

  getSearchFilters(): FilterField[] {
    return [
      { key: "type", label: "Type", type: "text" },
      { key: "technique", label: "Technique", type: "text" },
      { key: "department", label: "Department", type: "text" },
    ];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 24);
    const filters = params.filters ?? {};

    const qs = new URLSearchParams();
    if (params.query?.trim()) qs.set("q", params.query.trim());
    if (params.hasImage !== false) qs.set("has_image", "1");
    if (params.openAccessOnly !== false) qs.set("cc0", "1");
    qs.set("limit", String(pageSize));
    qs.set("skip", String((page - 1) * pageSize));
    if (filters.objectType) qs.set("type", String(filters.objectType));
    else if (filters.type) qs.set("type", String(filters.type));
    if (filters.technique) qs.set("technique", String(filters.technique));
    if (filters.department) qs.set("department", String(filters.department));
    // dateRange arrives as "begin,end" (years) -> created_after / created_before.
    if (typeof filters.dateRange === "string" && filters.dateRange.includes(",")) {
      const [begin, end] = filters.dateRange.split(",");
      if (begin) qs.set("created_after", begin);
      if (end) qs.set("created_before", end);
    }

    const res = await fetchJson<CmaSearchResponse>(`${CMA_BASE}?${qs}`);
    const total = res.info?.total ?? res.data.length;
    const cards = res.data.map((o) => toCard(normalize(o)));

    return {
      cards,
      page,
      pageSize,
      total,
      hasMore: (page - 1) * pageSize + pageSize < total,
    };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const res = await fetchJson<{ data: CmaArtwork }>(
      `${CMA_BASE}/${museumObjectId}`
    );
    return normalize(res.data);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    const raw = artwork.raw as CmaArtwork;
    const web = raw.images?.web?.url;
    const print = raw.images?.print?.url;
    if (targetWidth <= WEB_MAX_WIDTH && web) return web;
    return print || web || "";
  },
};
