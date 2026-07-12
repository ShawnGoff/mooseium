// lib/museums/harvard.ts
// MuseumAdapter for the Harvard Art Museums.
// Docs: https://github.com/harvardartmuseums/api-docs  |  Free API key required.
// Set HARVARD_API_KEY in the environment.
//
// Notes:
//  - Rate limited to ~2,500 calls/day, so keep pageSize modest.
//  - Harvard has no single "CC0" flag; we treat imagepermissionlevel === 0
//    (fully displayable) + a primary image as our open-access gate.
//  - Images are IIIF when iiifbaseuri is present.

import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const HAM_BASE = "https://api.harvardartmuseums.org";

const FIELDS = [
  "id",
  "objectid",
  "title",
  "dated",
  "datebegin",
  "dateend",
  "people",
  "culture",
  "medium",
  "dimensions",
  "classification",
  "creditline",
  "url",
  "primaryimageurl",
  "images",
  "imagepermissionlevel",
  "labeltext",
  "commentary",
  "department",
  "period",
  "technique",
  "provenance",
  "exhibitions",
  "gallery",
].join(",");

interface HamImage {
  baseimageurl?: string;
  iiifbaseuri?: string;
  width?: number;
  height?: number;
}

interface HamPerson {
  name?: string;
  displayname?: string;
  displaydate?: string;
  culture?: string;
  role?: string;
}

interface HamRecord {
  id: number;
  objectid: number;
  title: string;
  dated?: string;
  datebegin?: number;
  dateend?: number;
  people?: HamPerson[];
  culture?: string;
  medium?: string;
  dimensions?: string;
  classification?: string;
  creditline?: string;
  url?: string;
  primaryimageurl?: string;
  images?: HamImage[];
  imagepermissionlevel?: number;
  labeltext?: string;
  commentary?: string;
  department?: string;
  period?: string;
  technique?: string;
  provenance?: string;
  exhibitions?: { title?: string }[];
  gallery?: { name?: string } | null;
}

interface HamSearchResponse {
  info: { totalrecords: number; page: number; pages: number };
  records: HamRecord[];
}

function key(): string {
  return process.env.HARVARD_API_KEY ?? "";
}

async function fetchJson<T>(url: string): Promise<T> {
  // Cache upstream museum responses for a day (records are effectively static).
  // Also protects Harvard's 2,500-calls/day cap.
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Harvard API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

function artistOf(r: HamRecord): string | undefined {
  const people = r.people ?? [];
  const artist = people.find((p) => (p.role ?? "").toLowerCase() === "artist");
  return (artist ?? people[0])?.displayname || (artist ?? people[0])?.name;
}

function buildArtistBio(r: HamRecord): string | undefined {
  const people = r.people ?? [];
  const p = people.find((x) => (x.role ?? "").toLowerCase() === "artist") ?? people[0];
  if (!p) return undefined;
  return [p.culture, p.displaydate].filter(Boolean).join(", ") || undefined;
}

function firstImage(r: HamRecord): HamImage | undefined {
  return r.images?.[0];
}

function imageUrl(r: HamRecord, width: number): string {
  const img = firstImage(r);
  if (img?.iiifbaseuri) {
    return `${img.iiifbaseuri}/full/${Math.round(width)},/0/default.jpg`;
  }
  if (r.primaryimageurl) {
    // Harvard's IDS URLs accept width/height query params.
    return `${r.primaryimageurl}${
      r.primaryimageurl.includes("?") ? "&" : "?"
    }width=${Math.round(width)}`;
  }
  return "";
}

function isOpen(r: HamRecord): boolean {
  return r.imagepermissionlevel === 0 && Boolean(r.primaryimageurl);
}

function normalize(r: HamRecord): NormalizedArtwork {
  const img = firstImage(r);
  return {
    sourceMuseum: "harvard",
    museumObjectId: String(r.objectid ?? r.id),
    title: r.title || "Untitled",
    artist: artistOf(r),
    dateText: r.dated || undefined,
    medium: r.medium || undefined,
    culture: r.culture || undefined,
    dimensions: r.dimensions || undefined,
    objectType: r.classification || undefined,
    description: r.labeltext || r.commentary || undefined,
    creditLine: r.creditline || undefined,
    tags: [],
    rights: {
      status: "unknown",
      license: undefined,
      attribution: r.creditline || undefined,
      isOpenAccess: isOpen(r),
    },
    sourceImageUrl: imageUrl(r, 2048) || r.primaryimageurl || undefined,
    aspectRatio: img?.width && img?.height ? img.width / img.height : undefined,
    sourceUrl: r.url || undefined,
    details: [
      ["Department", r.department],
      ["Period", r.period],
      ["Technique", r.technique],
    ]
      .filter(([, v]) => v)
      .map(([label, value]) => ({ label: label as string, value: value as string })),
    provenance: r.provenance || undefined,
    artistBio: buildArtistBio(r),
    additionalImages: (r.images ?? [])
      .slice(1)
      .map((im) =>
        im.iiifbaseuri
          ? `${im.iiifbaseuri}/full/843,/0/default.jpg`
          : im.baseimageurl
      )
      .filter((u): u is string => Boolean(u)),
    exhibitions: (r.exhibitions ?? [])
      .map((e) => e.title)
      .filter((t): t is string => Boolean(t)),
    onView: r.gallery?.name || undefined,
    raw: r,
  };
}

function toCard(a: NormalizedArtwork): ArtworkCard {
  const r = a.raw as HamRecord;
  return {
    sourceMuseum: a.sourceMuseum,
    museumObjectId: a.museumObjectId,
    title: a.title,
    artist: a.artist,
    dateText: a.dateText,
    thumbnailUrl: imageUrl(r, 400),
    objectType: a.objectType,
  };
}

export const harvardAdapter: MuseumAdapter = {
  slug: "harvard",
  displayName: "Harvard Art Museums",
  requiresApiKey: true,

  getSearchFilters(): FilterField[] {
    return [{ key: "classification", label: "Type", type: "text" }];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 24);
    const filters = params.filters ?? {};

    // Build an Elasticsearch-style q from keyword + optional date range.
    const parts: string[] = [];
    if (params.query?.trim()) parts.push(`(${params.query.trim()})`);
    if (typeof filters.dateRange === "string" && filters.dateRange.includes(",")) {
      const [begin, end] = filters.dateRange.split(",");
      if (begin && end) parts.push(`datebegin:<=${end} AND dateend:>=${begin}`);
    }
    const q = parts.join(" AND ") || "*";

    const qs = new URLSearchParams({
      apikey: key(),
      q,
      hasimage: "1",
      size: String(pageSize),
      page: String(page),
      fields: FIELDS,
      sort: "rank",
    });
    const cls = filters.objectType ?? filters.classification;
    if (cls) qs.set("classification", String(cls));

    const data = await fetchJson<HamSearchResponse>(`${HAM_BASE}/object?${qs}`);
    const records = data.records ?? [];

    const cards: ArtworkCard[] = [];
    for (const r of records) {
      if (params.openAccessOnly !== false && !isOpen(r)) continue;
      cards.push(toCard(normalize(r)));
    }

    return {
      cards,
      page,
      pageSize,
      total: data.info?.totalrecords,
      hasMore: (data.info?.page ?? page) < (data.info?.pages ?? page),
    };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const qs = new URLSearchParams({ apikey: key(), fields: FIELDS });
    const r = await fetchJson<HamRecord>(
      `${HAM_BASE}/object/${museumObjectId}?${qs}`
    );
    return normalize(r);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    return imageUrl(artwork.raw as HamRecord, targetWidth);
  },
};
