// lib/museums/types.ts
// The contract every museum adapter implements. Each museum (Met, Art Institute,
// Cleveland, ...) provides one implementation; the rest of the app talks only to
// this interface and never contains museum-specific logic.

/** Rights / licensing for a piece. Only open-access works are saved or displayed. */
export interface Rights {
  status: "public_domain" | "cc0" | "unknown";
  license?: string;
  attribution?: string;
  isOpenAccess: boolean;
}

/** The normalized artwork the whole app uses. Mirrors the `artworks` catalog table. */
export interface NormalizedArtwork {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
  artist?: string;
  dateText?: string;
  medium?: string;
  culture?: string;
  dimensions?: string;
  objectType?: string;
  description?: string;
  creditLine?: string;
  tags: string[];
  rights: Rights;
  sourceImageUrl?: string;
  aspectRatio?: number;
  sourceUrl?: string;
  /** Curated extra fields (department, period, accession, origin, …). */
  details?: { label: string; value: string }[];
  /** Narrative ownership history. */
  provenance?: string;
  /** A "did you know?" style fact. */
  funFact?: string;
  /** Short artist biography / dates. */
  artistBio?: string;
  /** Additional image URLs (other views of the piece). */
  additionalImages?: string[];
  /** Exhibition history entries. */
  exhibitions?: string[];
  /** Current on-view location, e.g. "Gallery 634". */
  onView?: string;
  raw: unknown;
}

/** Search request. `filters` keys correspond to FilterField.key values. */
export interface SearchParams {
  query?: string;
  filters?: Record<string, string | number | boolean>;
  page?: number;
  pageSize?: number;
  hasImage?: boolean;
  openAccessOnly?: boolean;
}

/** Lightweight result for the search grid. */
export interface ArtworkCard {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
  artist?: string;
  dateText?: string;
  thumbnailUrl: string;
  objectType?: string;
}

export interface SearchResult {
  cards: ArtworkCard[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterField {
  key: string;
  label: string;
  type: "text" | "select" | "boolean" | "dateRange";
  options?: FilterOption[];
}

export interface MuseumAdapter {
  readonly slug: string;
  readonly displayName: string;
  readonly requiresApiKey: boolean;

  /** Filter fields this museum supports; render under the search box when selected. */
  getSearchFilters(): FilterField[];

  /** Run a search and return finished cards (ID-only museums hydrate internally). */
  search(params: SearchParams): Promise<SearchResult>;

  /** Fetch and normalize a single object's full record (used at save time). */
  getObject(museumObjectId: string): Promise<NormalizedArtwork>;

  /** Build an image URL for a target width (IIIF, preset, or fixed URL per museum). */
  getImageUrl(artwork: NormalizedArtwork, targetWidth: number): string;
}

export type MuseumRegistry = Record<string, MuseumAdapter>;
