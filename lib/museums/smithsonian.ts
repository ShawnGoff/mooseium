// lib/museums/smithsonian.ts
// MuseumAdapter for the Smithsonian Open Access API (EDAN).
// Docs: https://www.si.edu/openaccess/devtools  |  Free key from api.data.gov.
// Set SMITHSONIAN_API_KEY in the environment.
//
// Important traits of this API (learned from real responses):
//  - The /search response returns NO image URLs — only a flag that images exist.
//  - Image URLs live in the full record (the /content endpoint), and ONLY for
//    public-domain works. Modern/rights-restricted objects are flagged as having
//    images but the file is withheld.
// So we search, then hydrate each hit via /content, and keep only records that
// actually carry a media image. Results skew toward public-domain art.

import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const SI_BASE = "https://api.si.edu/openaccess/api/v1.0";

// Restrict to the Smithsonian's art museums so we search their actual art
// collections, not the 11M+ specimens/archives/books in the wider open-access set.
//   SAAM  = Smithsonian American Art Museum
//   FSG   = Freer Gallery of Art & Arthur M. Sackler Gallery (great IIIF)
//   NPG   = National Portrait Gallery
//   CHNDM = Cooper Hewitt, Smithsonian Design Museum
//   HMSG  = Hirshhorn Museum and Sculpture Garden
//   NMAfA = National Museum of African Art
//   NMAAHC = National Museum of African American History and Culture
//   NMAI  = National Museum of the American Indian
//   ACM   = Anacostia Community Museum
// (Deliberately excluded: NMNH/NASM and the archives units, whose specimens and
// documents would swamp the art with non-visual records.)
const ART_UNITS =
  "unit_code:(SAAM OR FSG OR NPG OR CHNDM OR HMSG OR NMAfA OR NMAAHC OR NMAI OR ACM)";

interface EdanMedia {
  type?: string;
  content?: string;
  url?: string;
  thumbnail?: string;
  idsId?: string;
  usage?: { access?: string };
  resources?: { url?: string; label?: string }[];
}

interface EdanRecord {
  id: string;
  url?: string;
  title?: string;
  content?: {
    descriptiveNonRepeating?: {
      title?: { content?: string };
      record_ID?: string;
      record_link?: string;
      data_source?: string;
      online_media?: { media?: EdanMedia[] };
      metadata_usage?: { access?: string };
    };
    freetext?: {
      name?: { label?: string; content?: string }[];
      date?: { label?: string; content?: string }[];
      objectType?: { label?: string; content?: string }[];
      creditLine?: { label?: string; content?: string }[];
      physicalDescription?: { label?: string; content?: string }[];
      notes?: { label?: string; content?: string }[];
    };
    indexedStructured?: {
      object_type?: string[];
      culture?: string[];
      date?: string[];
      topic?: string[];
    };
  };
}

interface EdanSearchResponse {
  response?: { rows?: { id: string; url?: string }[]; rowCount?: number };
}

function key(): string {
  return process.env.SMITHSONIAN_API_KEY ?? "";
}

async function fetchJson<T>(url: string): Promise<T> {
  // Cache upstream museum responses for a day (records are effectively static).
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Smithsonian API ${res.status} for ${url}`);
  return (await res.json()) as T;
}

// Pull a usable image (full + thumbnail) from a full record, or undefined.
function mediaImage(
  rec: EdanRecord
): { content: string; thumbnail: string } | undefined {
  const media = rec.content?.descriptiveNonRepeating?.online_media?.media;
  if (!Array.isArray(media)) return undefined;
  for (const m of media) {
    if (m.type && m.type !== "Images") continue;
    const fromResources = m.resources?.find(
      (r) => typeof r.url === "string" && /ids\.si\.edu|iiif/.test(r.url)
    )?.url;
    const full = m.content || m.url || fromResources || m.thumbnail;
    if (full) {
      return { content: full, thumbnail: m.thumbnail || full };
    }
  }
  return undefined;
}

function isOpen(rec: EdanRecord): boolean {
  const objectAccess = (
    rec.content?.descriptiveNonRepeating?.metadata_usage?.access ?? ""
  ).toUpperCase();
  return objectAccess === "CC0" && Boolean(mediaImage(rec));
}

function firstContent(arr?: { content?: string }[]): string | undefined {
  return arr?.find((x) => x.content)?.content;
}

// Artist strings include biography, e.g. "Arthur A. Marschner, born Detroit...".
function cleanArtist(s?: string): string | undefined {
  if (!s) return undefined;
  return s.replace(/,\s*(born|active|died)\b.*$/i, "").trim() || s;
}

function dimensionsOf(
  arr?: { label?: string; content?: string }[]
): string | undefined {
  return arr?.find((x) => /dimension/i.test(x.label ?? ""))?.content;
}

// Smithsonian keeps descriptive text in notes labeled "Summary" / "Description".
function noteText(
  arr?: { label?: string; content?: string }[]
): string | undefined {
  return arr?.find((x) => /summary|description/i.test(x.label ?? ""))?.content;
}

function sized(url: string, width: number): string {
  if (url.includes("deliveryService") && !/[?&]max=/.test(url)) {
    return url + (url.includes("?") ? "&" : "?") + "max=" + Math.round(width);
  }
  return url;
}

function normalize(rec: EdanRecord): NormalizedArtwork {
  const dnr = rec.content?.descriptiveNonRepeating;
  const ft = rec.content?.freetext;
  const idx = rec.content?.indexedStructured;
  const img = mediaImage(rec);

  return {
    sourceMuseum: "smithsonian",
    museumObjectId: rec.url || rec.id,
    title: dnr?.title?.content || rec.title || "Untitled",
    artist: cleanArtist(firstContent(ft?.name)),
    dateText: firstContent(ft?.date) || idx?.date?.[0],
    medium: firstContent(ft?.physicalDescription),
    culture: idx?.culture?.[0],
    dimensions: dimensionsOf(ft?.physicalDescription),
    // Prefer the indexed object_type — it's the value the API can filter on.
    objectType: idx?.object_type?.[0] || firstContent(ft?.objectType),
    description: noteText(ft?.notes),
    creditLine: firstContent(ft?.creditLine),
    tags: (idx?.topic ?? []).filter(Boolean),
    rights: {
      status: "cc0",
      license: "CC0",
      attribution: firstContent(ft?.creditLine) || dnr?.data_source,
      isOpenAccess: isOpen(rec),
    },
    sourceImageUrl: img ? img.content : undefined,
    aspectRatio: undefined,
    sourceUrl:
      dnr?.record_link ||
      (dnr?.record_ID ? `https://www.si.edu/object/${dnr.record_ID}` : undefined),
    raw: rec,
  };
}

function toCard(a: NormalizedArtwork): ArtworkCard {
  const img = mediaImage(a.raw as EdanRecord);
  return {
    sourceMuseum: a.sourceMuseum,
    museumObjectId: a.museumObjectId,
    title: a.title,
    artist: a.artist,
    dateText: a.dateText,
    thumbnailUrl: img ? sized(img.thumbnail, 400) : "",
    objectType: a.objectType,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (i: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

async function hydrate(idOrUrl: string): Promise<EdanRecord> {
  const data = await fetchJson<{ response?: EdanRecord }>(
    `${SI_BASE}/content/${idOrUrl}?api_key=${key()}`
  );
  if (!data.response) throw new Error("Smithsonian object not found");
  return data.response;
}

export const smithsonianAdapter: MuseumAdapter = {
  slug: "smithsonian",
  displayName: "Smithsonian Open Access",
  requiresApiKey: true,

  getSearchFilters(): FilterField[] {
    return [];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    // Their object_type query filter is unreliable, so we filter type on our
    // side after hydrating (we already fetch each full record). Fetch more rows
    // when a type filter is active to keep pages from getting too thin.
    const wantTypeRaw = params.filters?.objectType
      ? String(params.filters.objectType)
      : null;
    const wantType = wantTypeRaw ? wantTypeRaw.toLowerCase() : null;
    const fetchRows = wantType ? 60 : 30;

    // Bias the query toward the requested type (as a keyword) so a type filter
    // actually surfaces that type instead of filtering a random page.
    const termParts: string[] = [];
    if (params.query?.trim()) termParts.push(`(${params.query.trim()})`);
    if (wantTypeRaw) termParts.push(`(${wantTypeRaw})`);
    const base = termParts.join(" AND ") || "*";
    const q = `${base} AND online_media_type:"Images" AND ${ART_UNITS}`;

    const qs = new URLSearchParams({
      api_key: key(),
      q,
      start: String((page - 1) * fetchRows),
      rows: String(fetchRows),
    });

    const data = await fetchJson<EdanSearchResponse>(`${SI_BASE}/search?${qs}`);
    const rows = data.response?.rows ?? [];
    const total = data.response?.rowCount;

    // Hydrate each hit to get the real image; keep only open-access-with-image
    // (and matching the requested type, if any).
    const hydrated = await mapLimit(rows, 8, async (row) => {
      try {
        const rec = await hydrate(row.url || row.id);
        if (params.openAccessOnly !== false && !isOpen(rec)) return null;
        const art = normalize(rec);
        if (wantType) {
          const a = (art.objectType ?? "").toLowerCase();
          if (!(a === wantType || a.includes(wantType) || wantType.includes(a)))
            return null;
        }
        return toCard(art);
      } catch {
        return null;
      }
    });
    const cards = hydrated.filter((c): c is ArtworkCard => c !== null);

    return {
      cards,
      page,
      pageSize: fetchRows,
      total,
      hasMore:
        typeof total === "number" ? page * fetchRows < total : rows.length === fetchRows,
    };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const rec = await hydrate(museumObjectId);
    return normalize(rec);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    const img = mediaImage(artwork.raw as EdanRecord);
    if (!img) return artwork.sourceImageUrl ?? "";
    const url = targetWidth <= 500 ? img.thumbnail : img.content;
    return sized(url || img.content, targetWidth);
  },
};
