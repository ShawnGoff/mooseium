"use client";

// Home page client experience (search, discovery feed, hero). Rendered by the
// server component in app/page.tsx, which owns the page metadata.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import Placard from "@/app/components/Placard";
import Tour, { type TourStep } from "@/app/components/Tour";

type FilterField = {
  key: string;
  label: string;
  type: "text" | "select" | "boolean" | "dateRange";
  options?: { value: string; label: string }[];
};
type Museum = { slug: string; displayName: string; filters?: FilterField[] };
type Collection = { id: string; name: string; count?: number };

type ArtworkCard = {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
  artist?: string;
  dateText?: string;
  thumbnailUrl: string;
  objectType?: string;
};

type SearchResult = {
  cards: ArtworkCard[];
  total?: number;
  hasMore: boolean;
  error?: string;
};

type SaveState = "idle" | "saved";

// Rotating hero pool: grand, in-catalog landscapes & cityscapes across the
// always-on museums. One is picked at random each load, so the hero changes on
// refresh (and naturally day to day). Each is resolved live through search, so
// a mismatch just falls through to the next candidate.
const HERO_POOL: { museum: string; label: string; q: string }[] = [
  { museum: "met", label: "The Met", q: "Heart of the Andes Church" },
  { museum: "met", label: "The Met", q: "Rocky Mountains Lander's Peak Bierstadt" },
  { museum: "met", label: "The Met", q: "Autumn on the Hudson River Cropsey" },
  { museum: "met", label: "The Met", q: "View from Mount Holyoke Oxbow Cole" },
  { museum: "met", label: "The Met", q: "Gorge in the Mountains Gifford" },
  { museum: "met", label: "The Met", q: "Wheat Field with Cypresses Van Gogh" },
  { museum: "rijks", label: "the Rijksmuseum", q: "Windmill at Wijk bij Duurstede Ruisdael" },
  { museum: "rijks", label: "the Rijksmuseum", q: "river landscape Cuyp" },
  { museum: "artic", label: "the Art Institute of Chicago", q: "Water Lilies Monet" },
  { museum: "artic", label: "the Art Institute of Chicago", q: "Paris Street Rainy Day Caillebotte" },
];

// Explore-by-Theme cards. Each is a real search; the card image is pulled live
// from that theme's own results (no owned/stock imagery).
const THEMES: { label: string; term: string }[] = [
  { label: "Landscapes", term: "landscape" },
  { label: "Portraits", term: "portrait" },
  { label: "Animals in Art", term: "animals" },
  { label: "Mythology", term: "mythology" },
  { label: "Flowers", term: "flowers" },
  { label: "Arms & Armor", term: "armor" },
];

function cardKey(c: { sourceMuseum: string; museumObjectId: string }) {
  return `${c.sourceMuseum}-${c.museumObjectId}`;
}

// Short museum labels for result cards (shown so cross-museum results are
// attributable at a glance).
const SHORT_MUSEUM: Record<string, string> = {
  met: "The Met",
  artic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  rijks: "Rijksmuseum",
  harvard: "Harvard Art Museums",
  smithsonian: "Smithsonian",
  vam: "Victoria & Albert",
};

export default function HomeClient() {
  const [museums, setMuseums] = useState<Museum[]>([]);
  const [museum, setMuseum] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [cards, setCards] = useState<ArtworkCard[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [searched, setSearched] = useState<boolean>(false);

  const [publicGalleries, setPublicGalleries] = useState<
    { slug: string; name: string; cover?: string; count: number; curator: string; handle?: string }[]
  >([]);
  const [museums3d, setMuseums3d] = useState<
    {
      handle: string;
      curator: string;
      museumName: string;
      cover?: string;
      galleryCount: number;
      pieceCount: number;
    }[]
  >([]);
  const [recentSaves, setRecentSaves] = useState<ArtworkCard[]>([]);
  // AI-curated, daily-rotating art shelves (pre-resolved server-side).
  const [artShelves, setArtShelves] = useState<
    { title: string; blurb: string; items: ArtworkCard[] }[]
  >([]);
  const [themePreviews, setThemePreviews] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState<string>("");
  const [hero, setHero] = useState<
    (ArtworkCard & { heroImage: string; museumLabel: string }) | null
  >(null);

  const [signedIn, setSignedIn] = useState<boolean>(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [modalCard, setModalCard] = useState<ArtworkCard | null>(null);

  // The card whose info placard is open (the placard self-fetches full details).
  const [placardCard, setPlacardCard] = useState<ArtworkCard | null>(null);

  // Advanced per-museum filters.
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const currentFilters = museums.find((m) => m.slug === museum)?.filters ?? [];

  // Pagination state for the results grid.
  const [, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [lastQ, setLastQ] = useState("");
  const [lastFilters, setLastFilters] = useState<
    Record<string, string> | undefined
  >(undefined);
  const cardsRef = useRef<ArtworkCard[]>([]);
  const pageRef = useRef(1);

  useEffect(() => {
    fetch("/api/museums")
      .then((r) => r.json())
      .then((d) => {
        setMuseums(d.museums ?? []);
        // Default stays on "all" (cross-museum); the dropdown can scope to one.
      })
      .catch(() => setStatus("Could not load museums."));
  }, []);

  // Discovery feed (works signed out too).
  useEffect(() => {
    fetch("/api/public-galleries")
      .then((r) => r.json())
      .then((d) => setPublicGalleries(d.galleries ?? []))
      .catch(() => {});
    fetch("/api/discover-museums")
      .then((r) => r.json())
      .then((d) => setMuseums3d(d.museums ?? []))
      .catch(() => {});
    fetch("/api/den/shelves?surface=museum")
      .then((r) => r.json())
      .then((d) => setArtShelves(d.shelves ?? []))
      .catch(() => {});
  }, []);

  // Hero artwork: a grand in-catalog landscape, picked at random from the pool
  // (so it rotates on refresh), resolved through our own search so the object ID
  // is always valid, then loaded at hero resolution and made clickable. Tries
  // the whole pool from a random offset until one resolves.
  useEffect(() => {
    let cancelled = false;
    const start = Math.floor(Math.random() * HERO_POOL.length);
    (async () => {
      for (let i = 0; i < HERO_POOL.length; i++) {
        const entry = HERO_POOL[(start + i) % HERO_POOL.length];
        try {
          const qs = new URLSearchParams({
            museum: entry.museum,
            q: entry.q,
            page: "1",
            pageSize: "5",
          });
          const res = await fetch(`/api/search?${qs}`);
          const data: SearchResult = await res.json();
          const card = data.cards?.find((c) => c.thumbnailUrl) ?? data.cards?.[0];
          if (!card) continue;
          const aRes = await fetch(
            `/api/artwork?museum=${entry.museum}&objectId=${card.museumObjectId}`
          );
          const aData = await aRes.json();
          const img = aData?.artwork?.image || card.thumbnailUrl;
          if (!cancelled && img) {
            setHero({ ...card, heroImage: img, museumLabel: entry.label });
            return;
          }
        } catch {
          /* try next candidate */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Theme-card images: one representative thumbnail per theme, fetched live so
  // we never ship stock/owned imagery. Fills in progressively.
  useEffect(() => {
    let cancelled = false;
    THEMES.forEach((t) => {
      const qs = new URLSearchParams({
        museum: "met",
        q: t.term,
        page: "1",
        pageSize: "6",
      });
      fetch(`/api/search?${qs}`)
        .then((r) => r.json())
        .then((d: SearchResult) => {
          const thumb = d.cards?.find((c) => c.thumbnailUrl)?.thumbnailUrl;
          if (!cancelled && thumb) {
            setThemePreviews((p) => ({ ...p, [t.label]: thumb }));
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (!res.ok) return;
      const d = await res.json();
      setCollections(d.collections ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadRecentSaves = useCallback(async () => {
    try {
      const res = await fetch("/api/recent-saves");
      if (!res.ok) return;
      const d = await res.json();
      setRecentSaves(d.cards ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const isIn = Boolean(data.user);
      setSignedIn(isIn);
      if (isIn) {
        loadCollections();
        loadRecentSaves();

        // Mark pieces already in the user's collections as saved, so search
        // results reflect it across sessions (not just saves made right now).
        supabase
          .from("saved_artworks")
          .select("artworks(source_museum, museum_object_id)")
          .eq("user_id", data.user!.id)
          .limit(2000)
          .then(({ data: rows }) => {
            type Row = {
              artworks: { source_museum: string; museum_object_id: string } | null;
            };
            const already: Record<string, SaveState> = {};
            for (const r of (rows as unknown as Row[] | null) ?? []) {
              const a = r.artworks;
              if (a) already[`${a.source_museum}-${a.museum_object_id}`] = "saved";
            }
            // Existing state wins — don't clobber a save made this session.
            setSaveStates((s) => ({ ...already, ...s }));
          });

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", data.user!.id)
          .single();
        setDisplayName(profile?.display_name ?? "");
      }
    });
  }, [loadCollections, loadRecentSaves]);

  const doSearch = useCallback(
    async (
      q: string,
      filters: Record<string, string> | undefined,
      pageNum: number,
      append: boolean,
      museumArg?: string
    ) => {
      const mus = museumArg ?? museum;
      if (museumArg && museumArg !== museum) setMuseum(museumArg);
      setSearched(true);
      setLoading(true);
      setLastQ(q);
      setLastFilters(filters);
      setPage(pageNum);
      pageRef.current = pageNum;

      // Reflect the search in the URL so results are shareable and the back
      // button works. Only on a fresh search (not on "Load more").
      if (!append && typeof window !== "undefined") {
        const sp = new URLSearchParams({ museum: mus });
        if (q) sp.set("q", q);
        if (filters) for (const [k, v] of Object.entries(filters)) sp.set(k, v);
        window.history.replaceState(null, "", `/?${sp.toString()}`);
      }
      if (!append) {
        cardsRef.current = [];
        setCards([]);
        setSaveStates({});
        setStatus("Searching…");
      }
      try {
        const qs = new URLSearchParams({
          museum: mus,
          q,
          page: String(pageNum),
          pageSize: "24",
        });
        if (filters) {
          for (const [k, v] of Object.entries(filters)) qs.set(k, v);
        }
        const res = await fetch(`/api/search?${qs}`);
        const data: SearchResult = await res.json();
        if (data.error) {
          setStatus(data.error);
          setHasMore(false);
          return;
        }
        // De-dupe by museum+id so overlapping pages don't collide on React keys
        // (which would make an appended page look like it loaded nothing).
        const combined = append ? [...cardsRef.current, ...data.cards] : data.cards;
        const seen = new Set<string>();
        const merged = combined.filter((c) => {
          const k = cardKey(c);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        cardsRef.current = merged;
        setCards(merged);
        setHasMore(Boolean(data.hasMore));
        setStatus(
          merged.length
            ? `Showing ${merged.length}${
                data.total ? ` of ${data.total}` : ""
              } result(s).`
            : "No results — try a different search."
        );
      } catch {
        setStatus("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [museum]
  );

  const loadMore = useCallback(() => {
    doSearch(lastQ, lastFilters, pageRef.current + 1, true);
  }, [doSearch, lastQ, lastFilters]);

  // Deep-link: /?museum=met&q=Landscapes (plus any filter params) runs that
  // search on load, so "See all" links from category rows land on full results.
  const urlInitDone = useRef(false);
  useEffect(() => {
    if (urlInitDone.current || museums.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const mus = params.get("museum");
    if (q === null || !mus) return;
    urlInitDone.current = true;
    const filters: Record<string, string> = {};
    params.forEach((v, k) => {
      if (!["q", "museum", "page", "pageSize"].includes(k)) filters[k] = v;
    });
    setQuery(q);
    doSearch(q, Object.keys(filters).length ? filters : undefined, 1, false, mus);
  }, [museums, doSearch]);

  function buildFilters(): Record<string, string> | undefined {
    const out: Record<string, string> = {};
    for (const f of currentFilters) {
      if (f.type === "dateRange") {
        const b = filterValues[`${f.key}__begin`];
        const e = filterValues[`${f.key}__end`];
        if (b && e) out[f.key] = `${b},${e}`;
      } else {
        const v = filterValues[f.key];
        if (v) out[f.key] = v;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query, buildFilters(), 1, false);
  }

  function changeMuseum(slug: string) {
    setMuseum(slug);
    setFilterValues({}); // filters are museum-specific
  }

  function setFilter(key: string, value: string) {
    setFilterValues((v) => ({ ...v, [key]: value }));
  }

  // Replay: /tutorial links to /?tour=1 to re-run the tour on demand.
  const [tourSignal, setTourSignal] = useState(0);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tour") === "1") {
      setTourSignal((n) => n + 1);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const homeTourSteps: TourStep[] = [
    {
      target: '[data-tour="search"]',
      title: "Search the world's art",
      body: "Type an artist, a subject, or a mood — we search six great museums at once.",
    },
    {
      target: '[data-tour="museum-select"]',
      title: "All six, or just one",
      body: "Search every museum together, or narrow to a single collection.",
    },
    {
      target: '[data-tour="themes"]',
      title: "Not sure where to start?",
      body: "These theme cards run curated searches — a fun way to wander.",
    },
    {
      target: '[data-tour="daily"]',
      title: "Today's collections",
      body: "A fresh, hand-curated set every day. Come back for new discoveries.",
    },
    {
      target: '[data-tour="piece"]',
      title: "Save what you love",
      body: "Tap any artwork to open it — then hit Save to add it to a collection and build your own museum.",
    },
    {
      title: "That's the tour!",
      body: "Need a hand later? The full guide is under “How to use” — in the top nav, or the ☰ menu on your phone. Enjoy exploring! 🫎",
    },
  ];

  function runChip(term: string) {
    setQuery(term);
    doSearch(term, undefined, 1, false);
  }

  // Click a piece's type label to filter the current museum by that type.
  function filterByType(objectType: string) {
    doSearch(query, { objectType }, 1, false);
  }

  function backToDiscover() {
    setSearched(false);
    cardsRef.current = [];
    setCards([]);
    setStatus("");
    setQuery("");
    setHasMore(false);
    setPage(1);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", "/");
    }
  }

  function renderCard(c: ArtworkCard) {
    const key = cardKey(c);
    const state = saveStates[key] ?? "idle";
    return (
      <article className="card" key={key}>
        <div
          className="thumb clickable"
          onClick={() => setPlacardCard(c)}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${c.title}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setPlacardCard(c);
            }
          }}
          title="View details"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {c.thumbnailUrl && <img src={c.thumbnailUrl} alt={c.title} loading="lazy" />}
        </div>
        <div className="meta">
          <p className="title">{c.title}</p>
          <p className="sub">
            {[c.artist, c.dateText].filter(Boolean).join(" · ") || "—"}
          </p>
          <span className="card-museum">
            {SHORT_MUSEUM[c.sourceMuseum] ?? c.sourceMuseum}
          </span>
          {c.objectType && (
            <button
              className="type type-btn"
              onClick={() => filterByType(c.objectType!)}
              title={`Show more ${c.objectType}`}
            >
              {c.objectType}
            </button>
          )}
          <div className="card-actions" data-tour="save">
            {!signedIn ? (
              <Link href="/login" className="save-btn ghost">
                Sign in to save
              </Link>
            ) : (
              <button className="save-btn" onClick={() => setModalCard(c)}>
                {state === "saved" ? "Saved ✓ · Save again" : "Save"}
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <main className="container">
      <section className="hero">
        <div className="hero-text">
          <h1 className="hero-title">
            The world&apos;s art. <span className="hero-accent">Your museum.</span>
          </h1>
          <p className="hero-sub">
            Explore masterpieces from six world-renowned museums and build your own
            collection.
          </p>
        </div>
        {hero && (
          <figure
            className="hero-media"
            data-tour="piece"
            onClick={() => setPlacardCard(hero)}
            role="button"
            tabIndex={0}
            aria-label={`View details for ${hero.title}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setPlacardCard(hero);
              }
            }}
            title="View details"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hero.heroImage} alt={hero.title} loading="eager" />
            <figcaption className="hero-caption">
              {hero.artist ? `${hero.artist}, ` : ""}
              <em>{hero.title}</em>
              {hero.dateText ? ` · ${hero.dateText}` : ""} · {hero.museumLabel}
            </figcaption>
          </figure>
        )}
      </section>

      <form className="searchbar" onSubmit={onSubmit} data-tour="search">
        <select
          data-tour="museum-select"
          aria-label="Museum to search"
          value={museum}
          onChange={(e) => changeMuseum(e.target.value)}
        >
          <option value="all">All museums</option>
          {museums.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.displayName}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Search artworks"
          placeholder="Search for art — e.g. sunflowers, Rembrandt, cats…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {searched && museum === "all" && (
        <p className="filter-hint">
          Searching all museums. Choose a single museum in the dropdown to filter
          by medium, date, or highlights.
        </p>
      )}

      {searched && currentFilters.length > 0 && (
        <div className="filters">
          <button
            type="button"
            className="filters-toggle"
            onClick={() => setShowFilters((v) => !v)}
          >
            {showFilters ? "▾ Filters" : "▸ Filters"}
          </button>
          {showFilters && (
            <div className="filters-panel">
              {currentFilters.map((f) => (
                <div className="filter-field" key={f.key}>
                  <label>{f.label}</label>
                  {f.type === "text" && (
                    <input
                      type="text"
                      value={filterValues[f.key] ?? ""}
                      onChange={(e) => setFilter(f.key, e.target.value)}
                    />
                  )}
                  {f.type === "select" && (
                    <select
                      value={filterValues[f.key] ?? ""}
                      onChange={(e) => setFilter(f.key, e.target.value)}
                    >
                      <option value="">Any</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {f.type === "boolean" && (
                    <input
                      type="checkbox"
                      checked={filterValues[f.key] === "true"}
                      onChange={(e) =>
                        setFilter(f.key, e.target.checked ? "true" : "")
                      }
                    />
                  )}
                  {f.type === "dateRange" && (
                    <div className="filter-range">
                      <input
                        type="number"
                        placeholder="From"
                        value={filterValues[`${f.key}__begin`] ?? ""}
                        onChange={(e) => setFilter(`${f.key}__begin`, e.target.value)}
                      />
                      <input
                        type="number"
                        placeholder="To"
                        value={filterValues[`${f.key}__end`] ?? ""}
                        onChange={(e) => setFilter(`${f.key}__end`, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button type="button" className="chip" onClick={() => onSubmit({ preventDefault() {} } as React.FormEvent)}>
                Apply filters
              </button>
            </div>
          )}
        </div>
      )}

      {searched ? (
        <>
          <p className="status">
            {status}{" "}
            <button className="text-link" onClick={backToDiscover}>
              ← Back to discover
            </button>
          </p>
          <p className="search-note">
            Searches are performed against each museum&apos;s original catalog
            data. Since metadata and descriptions vary by institution, results
            may occasionally be incomplete or include unexpected matches.
          </p>
          {lastFilters?.objectType && (
            <p className="status">
              Type: <strong>{lastFilters.objectType}</strong>{" "}
              <button
                className="text-link"
                onClick={() => doSearch(query, undefined, 1, false)}
              >
                ✕ clear
              </button>
            </p>
          )}
          <section className="grid">{cards.map(renderCard)}</section>
          {hasMore && (
            <div className="loadmore-wrap">
              <button className="loadmore" onClick={loadMore} disabled={loading}>
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="home-section">
            <h2 className="feed-heading" data-tour="themes">Explore by theme</h2>
            <div className="theme-grid">
              {THEMES.map((t) => (
                <button
                  key={t.label}
                  className="theme-card"
                  onClick={() => runChip(t.term)}
                  style={
                    themePreviews[t.label]
                      ? { backgroundImage: `url(${themePreviews[t.label]})` }
                      : undefined
                  }
                >
                  <span className="theme-label">{t.label}</span>
                </button>
              ))}
            </div>
          </section>

          {signedIn && (
            <section className="home-section welcome-back">
              <h2 className="feed-heading">
                Welcome back{displayName ? `, ${displayName}` : ""}
              </h2>
              <div className="welcome-cols">
                <div className="welcome-col">
                  <div className="welcome-col-head">
                    <h3>Recently saved</h3>
                    {recentSaves.length > 0 && <Link href="/collections">View all</Link>}
                  </div>
                  {recentSaves.length === 0 ? (
                    <p className="status">Save a piece and it&apos;ll show up here.</p>
                  ) : (
                    <div className="mini-row">
                      {recentSaves.slice(0, 4).map((c) => (
                        <button
                          key={cardKey(c)}
                          className="mini-thumb"
                          onClick={() => setPlacardCard(c)}
                          aria-label={`View details for ${c.title}`}
                          title={c.title}
                          style={
                            c.thumbnailUrl
                              ? { backgroundImage: `url(${c.thumbnailUrl})` }
                              : undefined
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="welcome-col">
                  <div className="welcome-col-head">
                    <h3>Your collections</h3>
                    {collections.length > 0 && <Link href="/collections">View all</Link>}
                  </div>
                  {collections.length === 0 ? (
                    <p className="status">
                      No collections yet — save a piece to start one.
                    </p>
                  ) : (
                    <div className="mini-collections">
                      {collections.slice(0, 3).map((c) => (
                        <Link key={c.id} href={`/collections/${c.id}`} className="mini-collection">
                          <span className="mini-collection-name">{c.name}</span>
                          <span className="mini-collection-count">
                            {c.count ?? 0} {(c.count ?? 0) === 1 ? "piece" : "pieces"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {artShelves.length > 0 && (
            <section className="home-section">
              <h2 className="feed-heading" data-tour="daily">Today&apos;s collections</h2>
              <p className="shelf-blurb">
                Freshly curated themes — a new set every day.
              </p>
              {artShelves.map((shelf) => (
                <div className="daily-shelf" key={shelf.title}>
                  <h3 className="daily-shelf-title">{shelf.title}</h3>
                  <p className="shelf-blurb">{shelf.blurb}</p>
                  <div className="art-shelf-row">
                    {shelf.items.map((c) => (
                      <button
                        key={cardKey(c)}
                        className="art-shelf-card"
                        onClick={() => setPlacardCard(c)}
                        title={c.title}
                      >
                        {c.thumbnailUrl && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={c.thumbnailUrl} alt={c.title} loading="lazy" />
                        )}
                        <span className="art-shelf-cap">
                          <span className="art-shelf-title">{c.title}</span>
                          {c.artist && (
                            <span className="art-shelf-artist">{c.artist}</span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {museums3d.length > 0 && (
            <section className="home-section">
              <h2 className="feed-heading">
                Museums to wander <span className="beta-tag">3D</span>
              </h2>
              <div className="pubgal-grid">
                {museums3d.map((m) => (
                  <Link
                    key={m.handle}
                    href={`/@${m.handle}/museum`}
                    className="pubgal-card"
                  >
                    <div
                      className="pubgal-img"
                      style={m.cover ? { backgroundImage: `url(${m.cover})` } : undefined}
                    />
                    <div className="pubgal-meta">
                      <span className="pubgal-name">🏛 {m.museumName}</span>
                      <span className="pubgal-curator">
                        {m.curator} · {m.galleryCount}{" "}
                        {m.galleryCount === 1 ? "gallery" : "galleries"} · {m.pieceCount}{" "}
                        pieces
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {publicGalleries.length > 0 && (
            <section className="home-section">
              <div className="feed-head-row">
                <h2 className="feed-heading">Galleries to explore</h2>
                <Link href="/galleries" className="feed-see-all">
                  See all →
                </Link>
              </div>
              <div className="pubgal-grid two-row">
                {publicGalleries.slice(0, 8).map((g) => (
                  <Link key={g.slug} href={`/g/${g.slug}`} className="pubgal-card">
                    <div
                      className="pubgal-img"
                      style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined}
                    />
                    <div className="pubgal-meta">
                      <span className="pubgal-name">{g.name}</span>
                      <span className="pubgal-curator">
                        {g.curator}
                        {g.handle ? ` · @${g.handle}` : ""}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {museums.length > 0 && (
            <section className="home-section">
              <h2 className="feed-heading">Explore our museums</h2>
              <div className="museum-strip">
                {museums.map((m) => (
                  <Link
                    key={m.slug}
                    href={`/museums/${m.slug}`}
                    className="museum-chip"
                  >
                    {m.displayName}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {modalCard && (
        <SaveToCollectionModal
          card={modalCard}
          collections={collections}
          onClose={() => setModalCard(null)}
          onSaved={(card) => {
            setSaveStates((s) => ({ ...s, [cardKey(card)]: "saved" }));
            setModalCard(null);
            loadCollections();
          }}
          onCollectionCreated={(col) =>
            setCollections((cs) => [...cs, { ...col, count: 0 }])
          }
        />
      )}

      {placardCard && (
        <Placard
          artwork={{
            title: placardCard.title,
            artist: placardCard.artist,
            dateText: placardCard.dateText,
            objectType: placardCard.objectType,
            sourceMuseum: placardCard.sourceMuseum,
            image: placardCard.thumbnailUrl,
          }}
          source={{
            museum: placardCard.sourceMuseum,
            objectId: placardCard.museumObjectId,
          }}
          onSave={
            signedIn
              ? () => {
                  setModalCard(placardCard);
                  setPlacardCard(null);
                }
              : undefined
          }
          signedOut={!signedIn}
          onClose={() => setPlacardCard(null)}
        />
      )}

      <Tour
        storageKey="mooseium-tour-home"
        autoStart
        startSignal={tourSignal}
        steps={homeTourSteps}
        welcome={{
          title: "Welcome to Mooseium 🫎",
          body: "Curate the world's open-access art into your own galleries and 3D museum. Want a quick 30-second tour?",
          yes: "Show me around",
          no: "I'll explore",
        }}
      />
    </main>
  );
}

function SaveToCollectionModal({
  card,
  collections,
  onClose,
  onSaved,
  onCollectionCreated,
}: {
  card: ArtworkCard;
  collections: Collection[];
  onClose: () => void;
  onSaved: (card: ArtworkCard) => void;
  onCollectionCreated: (col: { id: string; name: string }) => void;
}) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = showAll ? collections : collections.slice(0, 3);
  const hiddenCount = collections.length - visible.length;

  async function saveInto(collectionId: string) {
    setBusy(collectionId);
    setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          museum: card.sourceMuseum,
          objectId: card.museumObjectId,
          collectionId,
        }),
      });
      if (!res.ok) throw new Error();
      onSaved(card);
    } catch {
      setError("Could not save. Please try again.");
      setBusy(null);
    }
  }

  async function createAndSave(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const col = await res.json();
      onCollectionCreated({ id: col.id, name: col.name });
      await saveInto(col.id);
    } catch {
      setError("Could not create the collection.");
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Save to a collection</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="modal-sub">{card.title}</p>

        {collections.length > 0 && (
          <>
            <ul className="modal-collections">
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    className="modal-collection"
                    onClick={() => saveInto(c.id)}
                    disabled={busy !== null}
                  >
                    <span>{c.name}</span>
                    <span className="modal-collection-meta">
                      {busy === c.id
                        ? "Saving…"
                        : `${c.count ?? 0} ${
                            (c.count ?? 0) === 1 ? "piece" : "pieces"
                          }`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {collections.length > 3 && (
              <button
                type="button"
                className="modal-more"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Show fewer" : `▾ ${hiddenCount} more collections`}
              </button>
            )}
          </>
        )}

        <div className="modal-divider">
          <span>{collections.length > 0 ? "or create new" : "create a collection"}</span>
        </div>

        <form className="modal-new" onSubmit={createAndSave}>
          <input
            type="text"
            placeholder="Collection name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={busy !== null || !newName.trim()}>
            {busy === "new" ? "Creating…" : "Create & save"}
          </button>
        </form>

        {error && <p className="status error">{error}</p>}
      </div>
    </div>
  );
}
