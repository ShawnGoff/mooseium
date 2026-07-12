// lib/museums/rijksmuseum.ts
// MuseumAdapter for the Rijksmuseum, using the new (keyless) Search API + EDM.
// Docs: https://data.rijksmuseum.nl/tutorials/search  and  .../tutorials/iiif
//
// Flow (like the Met's ID-then-hydrate pattern):
//   1. Search API returns identifiers only (cursor pagination via `next`).
//   2. Resolve each identifier as EDM (RDF/XML) in one request — EDM includes a
//      directly usable IIIF image URL (edm:isShownBy -> iiif.micr.io/<id>/...),
//      so no 3-step Linked Art image chain is needed.
//   3. Keep only public-domain works with an image.

import { XMLParser } from "fast-xml-parser";
import type {
  MuseumAdapter,
  NormalizedArtwork,
  SearchParams,
  SearchResult,
  ArtworkCard,
  FilterField,
} from "./types";

const SEARCH_URL = "https://data.rijksmuseum.nl/search/collection";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

interface SearchPage {
  partOf?: { totalItems?: number };
  next?: { id?: string };
  orderedItems?: { id: string }[];
}

// The normalized-from-EDM record we stash in `raw`.
interface RijksRecord {
  title?: string;
  creator?: string;
  date?: string;
  description?: string;
  objectType?: string;
  medium?: string;
  dimensions?: string;
  objectNumber?: string;
  micrId?: string;
  rights?: string;
  sourceUrl?: string;
  tags?: string[];
  provenance?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  // Cache upstream museum responses for a day (records are effectively static).
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Rijksmuseum search ${res.status}`);
  return (await res.json()) as T;
}

async function fetchEdm(localId: string): Promise<RijksRecord> {
  const res = await fetch(
    `https://data.rijksmuseum.nl/${localId}?_profile=edm`,
    { headers: { Accept: "application/rdf+xml" }, next: { revalidate: 86400 } }
  );
  if (!res.ok) throw new Error(`Rijksmuseum resolve ${res.status}`);
  const xml = await res.text();
  return parseEdm(xml);
}

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

// The Rijksmuseum's EDM feed serves its canonical Dutch labels, and English
// isn't always present as a language-tagged literal. For the controlled
// vocabularies (object types, materials, techniques) we translate the common
// terms so cards read in English. Titles are left untouched — a real catalog
// title shouldn't be machine-translated.
const NL_EN: Record<string, string> = {
  // object types
  schilderij: "painting",
  prent: "print",
  kostuumprent: "costume print",
  tekening: "drawing",
  ets: "etching",
  gravure: "engraving",
  houtsnede: "woodcut",
  litho: "lithograph",
  lithografie: "lithograph",
  foto: "photograph",
  fotografie: "photograph",
  beeldhouwwerk: "sculpture",
  beeld: "sculpture",
  meubel: "furniture",
  meubelen: "furniture",
  sieraad: "jewelry",
  boek: "book",
  porselein: "porcelain",
  aardewerk: "earthenware",
  vaas: "vase",
  bord: "dish",
  schaal: "dish",
  tegel: "tile",
  textiel: "textile",
  borduurwerk: "embroidery",
  kant: "lace",
  glas: "glass",
  munt: "coin",
  penning: "medal",
  wapen: "weapon",
  affiche: "poster",
  kaart: "map",
  pop: "doll",
  speelgoed: "toy",
  waaier: "fan",
  doos: "box",
  kast: "cabinet",
  // materials / techniques
  olieverf: "oil paint",
  doek: "canvas",
  paneel: "panel",
  papier: "paper",
  karton: "cardboard",
  perkament: "parchment",
  brons: "bronze",
  marmer: "marble",
  hout: "wood",
  ijzer: "iron",
  koper: "copper",
  zilver: "silver",
  goud: "gold",
  tin: "pewter",
  lood: "lead",
  katoen: "cotton",
  zijde: "silk",
  wol: "wool",
  linnen: "linen",
  leer: "leather",
  klei: "clay",
  terracotta: "terracotta",
  inkt: "ink",
  potlood: "pencil",
  krijt: "chalk",
  aquarel: "watercolor",
  gouache: "gouache",
  email: "enamel",
  ivoor: "ivory",
  // connective words in composite material phrases
  op: "on",
  en: "and",
  met: "with",
  van: "of",
};

// Translate a controlled-vocabulary term (type/material) token by token,
// leaving anything not in the glossary as-is.
function enTerm<T extends string | undefined>(value: T): T {
  if (!value) return value;
  const translated = value
    .split(/([\s,]+)/) // keep separators
    .map((tok) => {
      const key = tok.trim().toLowerCase();
      if (!key) return tok;
      return NL_EN[key] ?? tok;
    })
    .join("");
  return translated as T;
}

// Pick the English (or first) value from a possibly-multilingual field.
function textEn(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  const a = asArray(v as Record<string, unknown>[]);
  const en = a.find((x) => x["@_xml:lang"] === "en");
  const pick = (en ?? a[0]) as Record<string, unknown> | string | undefined;
  if (typeof pick === "string") return pick;
  const t = pick?.["#text"];
  return t == null ? undefined : String(t);
}

function resId(v: unknown): string | undefined {
  const a = asArray(v as Record<string, string>[]);
  return a[0]?.["@_rdf:resource"];
}

function parseEdm(xml: string): RijksRecord {
  const doc = parser.parse(xml)["rdf:RDF"] ?? {};
  const cho = doc["edm:ProvidedCHO"] ?? {};
  const agg = doc["ore:Aggregation"] ?? {};

  // Resolve reference labels (creator, type, materials) from embedded nodes.
  const labels: Record<string, string | undefined> = {};
  for (const t of ["edm:Agent", "skos:Concept", "edm:Place"]) {
    for (const node of asArray(doc[t] as Record<string, unknown>[])) {
      const id = node["@_rdf:about"] as string | undefined;
      if (id) labels[id] = textEn(node["skos:prefLabel"]);
    }
  }

  const image =
    agg["edm:isShownBy"]?.["@_rdf:resource"] ||
    agg["edm:object"]?.["@_rdf:resource"];
  const micrId =
    typeof image === "string"
      ? image.split("iiif.micr.io/")[1]?.split("/")[0]
      : undefined;

  const mediumLabels = asArray(cho["dcterms:medium"] as Record<string, string>[])
    .map((m) => labels[m["@_rdf:resource"]])
    .filter(Boolean);

  // Subjects reference skos:Concept nodes embedded in the same document.
  const tags = asArray(cho["dc:subject"] as Record<string, string>[])
    .map((s) => labels[s["@_rdf:resource"]])
    .filter((t): t is string => Boolean(t))
    .slice(0, 15);

  return {
    title: textEn(cho["dc:title"]),
    creator: labels[resId(cho["dc:creator"]) ?? ""],
    date: textEn(cho["dcterms:created"]),
    description: textEn(cho["dc:description"]),
    objectType: enTerm(labels[resId(cho["dc:type"]) ?? ""]),
    medium: enTerm(mediumLabels.join(", ") || undefined),
    dimensions: textEn(cho["dcterms:extent"]),
    objectNumber: textEn(cho["dc:identifier"]),
    micrId,
    rights: agg["edm:rights"]?.["@_rdf:resource"],
    sourceUrl: agg["edm:isShownAt"]?.["@_rdf:resource"],
    tags,
    provenance: textEn(cho["dcterms:provenance"]),
  };
}

function isOpen(r: RijksRecord): boolean {
  const rights = (r.rights ?? "").toLowerCase();
  return (
    Boolean(r.micrId) &&
    (rights.includes("publicdomain") || rights.includes("/zero/"))
  );
}

function iiif(micrId: string, width: number): string {
  return `https://iiif.micr.io/${micrId}/full/${Math.round(width)},/0/default.jpg`;
}

function normalize(localId: string, r: RijksRecord): NormalizedArtwork {
  const cc0 = (r.rights ?? "").toLowerCase().includes("/zero/");
  return {
    sourceMuseum: "rijks",
    museumObjectId: localId,
    title: r.title || "Untitled",
    artist: r.creator,
    dateText: r.date,
    medium: r.medium,
    culture: undefined,
    dimensions: r.dimensions,
    objectType: r.objectType,
    description: r.description,
    creditLine: undefined,
    tags: r.tags ?? [],
    rights: {
      status: cc0 ? "cc0" : "public_domain",
      license: r.rights,
      attribution: "Rijksmuseum, Amsterdam",
      isOpenAccess: isOpen(r),
    },
    sourceImageUrl: r.micrId ? iiif(r.micrId, 2048) : undefined,
    aspectRatio: undefined,
    sourceUrl: r.sourceUrl,
    details: r.objectNumber
      ? [{ label: "Object number", value: r.objectNumber }]
      : [],
    provenance: r.provenance,
    raw: r,
  };
}

function toCard(a: NormalizedArtwork): ArtworkCard {
  const r = a.raw as RijksRecord;
  return {
    sourceMuseum: a.sourceMuseum,
    museumObjectId: a.museumObjectId,
    title: a.title,
    artist: a.artist,
    dateText: a.dateText,
    thumbnailUrl: r.micrId ? iiif(r.micrId, 400) : "",
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

function buildSearchUrl(params: SearchParams): string {
  const qs = new URLSearchParams({ imageAvailable: "true" });
  // No generic keyword param exists; map free text to description (broad match).
  if (params.query?.trim()) qs.set("description", params.query.trim());
  const f = params.filters ?? {};
  if (f.creator) qs.set("creator", String(f.creator));
  if (f.objectType) qs.set("type", String(f.objectType));
  else if (f.type) qs.set("type", String(f.type));
  // Era chips: a full century maps to a wildcard, e.g. 1600-1699 -> "16??".
  if (typeof f.dateRange === "string" && f.dateRange.includes(",")) {
    const [b, e] = f.dateRange.split(",").map(Number);
    if (b >= 1000 && e === b + 99 && b % 100 === 0) {
      qs.set("creationDate", `${String(b).slice(0, 2)}??`);
    }
  }
  return `${SEARCH_URL}?${qs}`;
}

export const rijksmuseumAdapter: MuseumAdapter = {
  slug: "rijks",
  displayName: "Rijksmuseum",
  requiresApiKey: false,

  getSearchFilters(): FilterField[] {
    return [
      { key: "creator", label: "Creator", type: "text" },
      { key: "type", label: "Type", type: "text" },
    ];
  },

  async search(params: SearchParams): Promise<SearchResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 24);
    const offset = (page - 1) * pageSize;
    const need = offset + pageSize;

    // Follow cursor pages until we have enough identifiers for this window.
    let url: string | undefined = buildSearchUrl(params);
    const ids: string[] = [];
    let total: number | undefined;
    let guard = 0;
    while (url && ids.length < need && guard < 20) {
      const pageData: SearchPage = await fetchJson<SearchPage>(url);
      total = pageData.partOf?.totalItems ?? total;
      for (const it of pageData.orderedItems ?? []) {
        const localId = it.id.split("/").pop();
        if (localId) ids.push(localId);
      }
      url = pageData.next?.id;
      guard++;
    }

    const window = ids.slice(offset, offset + pageSize);
    const resolved = await mapLimit(window, 6, async (localId) => {
      try {
        const rec = await fetchEdm(localId);
        if (params.openAccessOnly !== false && !isOpen(rec)) return null;
        return toCard(normalize(localId, rec));
      } catch {
        return null;
      }
    });
    const cards = resolved.filter((c): c is ArtworkCard => c !== null);

    return {
      cards,
      page,
      pageSize,
      total,
      hasMore: typeof total === "number" ? offset + pageSize < total : Boolean(url),
    };
  },

  async getObject(museumObjectId: string): Promise<NormalizedArtwork> {
    const rec = await fetchEdm(museumObjectId);
    return normalize(museumObjectId, rec);
  },

  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string {
    const r = artwork.raw as RijksRecord;
    return r.micrId ? iiif(r.micrId, targetWidth) : artwork.sourceImageUrl ?? "";
  },
};
