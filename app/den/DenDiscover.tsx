"use client";

// The Den's discovery home: search public-domain books, browse by subject, and
// a "Because your museum has…" shelf that connects your collected artists to
// their books. Saving adds a book to your library.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { DenBook } from "./DenView";
import BookDetail from "./BookDetail";

type Result = {
  source: string;
  externalId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
};
type Shelf = { artist: string; books: Result[] };

// Session caches so the discovery feeds fetch once, not on every remount
// (switching to the Discover tab remounts this component).
let popularCache: Result[] | null = null;
let shelvesCache: Shelf[] | null = null;
let themedCache: ThemedShelfDef[] | null = null;

// Each subject shows a fixed representative cover straight from gutenberg.org's
// image CDN — no Gutendex calls, so the page loads instantly. (id = a well-known
// public-domain book in that subject.)
const SUBJECTS: { name: string; coverId: number }[] = [
  { name: "Fiction", coverId: 2701 }, // Moby Dick
  { name: "Poetry", coverId: 1322 }, // Leaves of Grass
  { name: "Philosophy", coverId: 2680 }, // Meditations
  { name: "History", coverId: 1404 }, // The Federalist Papers
  { name: "Adventure", coverId: 120 }, // Treasure Island
  { name: "Science Fiction", coverId: 36 }, // The War of the Worlds
  { name: "Drama", coverId: 1513 }, // Romeo and Juliet
  { name: "Children", coverId: 11 }, // Alice in Wonderland
  { name: "Short Stories", coverId: 2814 }, // Dubliners
  { name: "Biography", coverId: 148 }, // Autobiography of Benjamin Franklin
  { name: "Mystery", coverId: 1661 }, // Adventures of Sherlock Holmes
  { name: "Romance", coverId: 1342 }, // Pride and Prejudice
  { name: "Fantasy", coverId: 16 }, // Peter Pan
  { name: "Horror", coverId: 345 }, // Dracula
  { name: "Fairy Tales", coverId: 2591 }, // Grimms' Fairy Tales
  { name: "Travel", coverId: 103 }, // Around the World in Eighty Days
  { name: "Nature", coverId: 205 }, // Walden
  { name: "Humor", coverId: 308 }, // Three Men in a Boat
  { name: "Myths & Legends", coverId: 1727 }, // The Odyssey
  { name: "Gothic", coverId: 84 }, // Frankenstein
  { name: "Detective", coverId: 244 }, // A Study in Scarlet
  { name: "War", coverId: 2600 }, // War and Peace
  { name: "Sea Stories", coverId: 164 }, // Twenty Thousand Leagues Under the Sea
  { name: "Ancient World", coverId: 6130 }, // The Iliad
  { name: "Ghost Stories", coverId: 43 }, // Dr. Jekyll and Mr. Hyde
  { name: "Satire", coverId: 829 }, // Gulliver's Travels
  { name: "Essays", coverId: 3600 }, // Essays of Montaigne
  { name: "Economics", coverId: 3300 }, // The Wealth of Nations
  { name: "Classics", coverId: 1400 }, // Great Expectations
  { name: "Westerns", coverId: 978 }, // The Virginian
];
const subjectCover = (id: number) =>
  `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;

// Gutendex blocks Vercel's datacenter IPs, so we call it straight from the
// browser (each visitor's own IP is fine, and Gutendex allows CORS). Reading
// still goes through our API since that fetches gutenberg.org, which isn't
// blocked.
const GUTENDEX = "https://gutendex.com/books";
type GBook = {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: Record<string, string>;
};
function normalize(b: GBook): Result {
  return {
    source: "gutenberg",
    externalId: String(b.id),
    title: b.title,
    author: b.authors?.[0]?.name ?? null,
    coverUrl: b.formats?.["image/jpeg"] ?? null,
  };
}
async function gxFetch(query: string): Promise<{ results: Result[]; hasMore: boolean }> {
  const r = await fetch(`${GUTENDEX}?${query}`);
  if (!r.ok) throw new Error("gutendex");
  const d = (await r.json()) as { results?: GBook[]; next?: string | null };
  return { results: (d.results ?? []).map(normalize), hasMore: Boolean(d.next) };
}

// Themed discovery shelves. STEP 1: hardcoded to prove the UI — later these come
// from an LLM-generated, daily-rotating cache (`{ title, blurb, query }` each;
// the model curates the theme + query, Gutendex fills the books in the browser).
type ThemedShelfDef = { title: string; blurb: string; query: string };
const THEMED_SHELVES: ThemedShelfDef[] = [
  {
    title: "Voices from the Ancient World",
    blurb: "Epics, myth, and philosophy from antiquity.",
    query: "topic=ancient",
  },
  {
    title: "Chilling Tales for a Dark Night",
    blurb: "Gothic horror and things that go bump.",
    query: "topic=horror",
  },
  {
    title: "Great Adventures",
    blurb: "Voyages, quests, and derring-do on land and sea.",
    query: "topic=adventure",
  },
];

// One themed shelf: resolves its query against Gutendex in the browser and
// renders the resulting books. Module-level so it doesn't remount (and refetch)
// every time the parent re-renders (e.g. typing in the search box).
function ThemedShelf({
  shelf,
  renderCard,
}: {
  shelf: ThemedShelfDef;
  renderCard: (r: Result) => React.ReactNode;
}) {
  const [books, setBooks] = useState<Result[] | null>(null);
  useEffect(() => {
    let alive = true;
    gxFetch(shelf.query)
      .then(({ results }) => alive && setBooks(results.slice(0, 12)))
      .catch(() => alive && setBooks([]));
    return () => {
      alive = false;
    };
  }, [shelf.query]);

  // Hide a shelf that resolved to nothing rather than showing an empty row.
  if (books !== null && books.length === 0) return null;

  return (
    <section className="den-home-section">
      <h2>{shelf.title}</h2>
      <p className="den-shelf-blurb">{shelf.blurb}</p>
      <div className="den-shelf-row">
        {books === null ? (
          <p className="status">Loading…</p>
        ) : (
          books.map((r) => renderCard(r))
        )}
      </div>
    </section>
  );
}

export default function DenDiscover({
  userId,
  savedIds,
  onSaved,
  onOpenBook,
}: {
  // userId is null in public (signed-out) mode: saving/opening prompt sign-in
  // and reading routes to the public reader by Gutenberg id.
  userId: string | null;
  savedIds: Set<string>;
  onSaved: (b: DenBook) => void;
  onOpenBook?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [heading, setHeading] = useState("");
  const [searching, setSearching] = useState(false);
  const [shelves, setShelves] = useState<Shelf[] | null>(shelvesCache);
  const [popular, setPopular] = useState<Result[] | null>(popularCache);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<Set<string>>(new Set());
  const [baseParams, setBaseParams] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailBook, setDetailBook] = useState<Result | null>(null);
  // Themed shelves: start with the hardcoded defaults so something shows
  // immediately, then upgrade to the cached/generated set from the API.
  const [themed, setThemed] = useState<ThemedShelfDef[]>(
    themedCache ?? THEMED_SHELVES
  );

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    // The "connected to your art" shelf needs a signed-in user's collection.
    // The API returns just the artist NAMES (a DB read); we fetch their books
    // from Gutendex in the browser to dodge the datacenter block.
    if (!userId) {
      setShelves([]);
    } else if (shelvesCache === null) {
      fetch("/api/den/connected")
        .then((r) => r.json())
        .then(async (d) => {
          const artists: string[] = d.artists ?? [];
          const built = await Promise.all(
            artists.map(async (artist) => {
              try {
                const { results } = await gxFetch(
                  `search=${encodeURIComponent(artist)}`
                );
                return { artist, books: results.slice(0, 8) };
              } catch {
                return { artist, books: [] as Result[] };
              }
            })
          );
          const s = built.filter((sh) => sh.books.length > 0);
          if (s.length) shelvesCache = s; // don't cache an empty/failed result
          setShelves(s);
        })
        .catch(() => setShelves([]));
    }
    if (popularCache === null) {
      gxFetch("")
        .then(({ results }) => {
          if (results.length) popularCache = results;
          setPopular(results);
        })
        .catch(() => setPopular([]));
    }
    // Themed shelves come from the cache table (global + this user's own).
    // Empty until the generation job runs, so we keep the hardcoded fallback.
    if (themedCache === null) {
      fetch("/api/den/shelves?surface=library")
        .then((r) => r.json())
        .then((d) => {
          const s: ThemedShelfDef[] = d.shelves ?? [];
          if (s.length) {
            themedCache = s;
            setThemed(s);
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isSaved = (id: string) => savedIds.has(id) || justSaved.has(id);

  // `params` is a Gutendex query, e.g. `search=…` or `topic=…`.
  async function run(params: string, label: string) {
    setSearching(true);
    setHeading(label);
    setPage(1);
    try {
      let out = await gxFetch(params);
      let effective = params;
      // Subject names drift out of Gutendex's bookshelves; fall back to a
      // keyword search so a subject shelf isn't empty.
      if (params.startsWith("topic=") && out.results.length === 0) {
        const term = params.slice("topic=".length);
        const fb = await gxFetch(`search=${term}`);
        if (fb.results.length) {
          out = fb;
          effective = `search=${term}`;
        }
      }
      setBaseParams(effective);
      setResults(out.results);
      setHasMore(out.hasMore);
    } catch {
      setBaseParams(params);
      setResults([]);
      setHasMore(false);
    } finally {
      setSearching(false);
    }
  }

  async function loadMore() {
    if (!baseParams || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const { results: more, hasMore: hm } = await gxFetch(
        `${baseParams}&page=${next}`
      );
      // De-dupe by id in case pages overlap.
      setResults((prev) => {
        const base = prev ?? [];
        const seen = new Set(base.map((r) => r.externalId));
        return [...base, ...more.filter((r) => !seen.has(r.externalId))];
      });
      setHasMore(hm);
      setPage(next);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = q.trim();
    if (!t) return;
    run(`search=${encodeURIComponent(t)}`, `Results for “${t}”`);
  }

  async function save(r: Result) {
    if (!userId) {
      router.push("/login");
      return;
    }
    if (isSaved(r.externalId)) return;
    setSavingId(r.externalId);
    const { data, error } = await supabase
      .from("den_books")
      .insert({
        user_id: userId,
        source: r.source,
        external_id: r.externalId,
        title: r.title,
        author: r.author,
        cover_url: r.coverUrl,
      })
      .select("id, folder_id, title, author, cover_url, external_id")
      .single();
    setSavingId(null);
    if (!error && data) {
      setJustSaved((s) => new Set(s).add(r.externalId));
      onSaved(data as DenBook);
    } else if (error?.code === "23505") {
      setJustSaved((s) => new Set(s).add(r.externalId));
    }
  }

  // Save (or find, if already saved) and open the reader.
  async function openBook(r: Result) {
    // Public mode: read straight from the public reader by Gutenberg id — no
    // saved row needed.
    if (!userId) {
      setDetailBook(null);
      router.push(`/library/read/${encodeURIComponent(r.externalId)}`);
      return;
    }
    setSavingId(r.externalId);
    let id: string | null = null;
    const { data, error } = await supabase
      .from("den_books")
      .insert({
        user_id: userId,
        source: r.source,
        external_id: r.externalId,
        title: r.title,
        author: r.author,
        cover_url: r.coverUrl,
      })
      .select("id, folder_id, title, author, cover_url, external_id")
      .single();
    if (data) {
      id = data.id;
      setJustSaved((s) => new Set(s).add(r.externalId));
      onSaved(data as DenBook);
    } else if (error?.code === "23505") {
      const { data: ex } = await supabase
        .from("den_books")
        .select("id")
        .eq("user_id", userId)
        .eq("source", r.source)
        .eq("external_id", r.externalId)
        .single();
      id = (ex as { id: string } | null)?.id ?? null;
      setJustSaved((s) => new Set(s).add(r.externalId));
    }
    setSavingId(null);
    if (id) {
      setDetailBook(null);
      if (onOpenBook) onOpenBook(id);
      else router.push(`/den/book/${id}`);
    }
  }

  function Card({ r }: { r: Result }) {
    const saved = isSaved(r.externalId);
    return (
      <div className="den-book-card">
        <div className="den-cover den-cover-click" onClick={() => setDetailBook(r)}>
          {r.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.coverUrl} alt="" loading="lazy" />
          ) : (
            <span className="den-cover-fallback">📖</span>
          )}
        </div>
        <div
          className="den-card-title den-cover-click"
          title={r.title}
          onClick={() => setDetailBook(r)}
        >
          {r.title}
        </div>
        {r.author && <div className="den-card-sub">{r.author}</div>}
        <button
          className={`den-save-btn${saved ? " saved" : ""}`}
          onClick={() => save(r)}
          disabled={saved || savingId === r.externalId}
        >
          {saved ? "✓ In library" : savingId === r.externalId ? "Saving…" : "＋ Save"}
        </button>
      </div>
    );
  }

  return (
    <div className="den-discover">
      <form className="den-discover-search" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="Search public-domain books — title or author…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {results !== null || searching ? (
        <section className="den-home-section">
          <div className="den-section-head">
            <h2>{heading || "Searching…"}</h2>
            {!searching && (
              <button
                className="text-link"
                onClick={() => {
                  setResults(null);
                  setHeading("");
                }}
              >
                ← Back to discover
              </button>
            )}
          </div>
          {searching ? (
            <div className="den-searching" role="status" aria-live="polite">
              <span className="den-spinner" aria-hidden />
              <p>
                Searching public-domain books…
                <br />
                <span className="den-searching-sub">
                  this can take up to a minute — hang tight.
                </span>
              </p>
            </div>
          ) : results && results.length === 0 ? (
            <p className="status">No books found. Try another search.</p>
          ) : (
            <>
              <div className="den-grid">
                {(results ?? []).map((r) => (
                  <Card key={r.externalId} r={r} />
                ))}
              </div>
              {hasMore && (
                <div className="den-loadmore-wrap">
                  <button
                    className="den-loadmore"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more books"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <section className="den-home-section">
            <h2>Browse by subject</h2>
            <div className="den-subject-grid">
              {SUBJECTS.map((s) => (
                <button
                  key={s.name}
                  className="den-subject-card"
                  onClick={() => run(`topic=${encodeURIComponent(s.name)}`, s.name)}
                  style={{ backgroundImage: `url(${subjectCover(s.coverId)})` }}
                >
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
          </section>

          {popular && popular.length > 0 && (
            <section className="den-home-section">
              <h2>Popular in the public domain</h2>
              <div className="den-shelf-row">
                {popular.map((r) => (
                  <Card key={r.externalId} r={r} />
                ))}
              </div>
            </section>
          )}

          {themed.map((sh) => (
            <ThemedShelf
              key={sh.title}
              shelf={sh}
              renderCard={(r) => <Card key={r.externalId} r={r} />}
            />
          ))}

          {shelves === null ? (
            <p className="status">Finding books connected to your art…</p>
          ) : shelves.length === 0 ? (
            <p className="status den-connected-empty">
              Save art to your collections and books connected to those artists
              (their letters, biographies, writings) will appear here.
            </p>
          ) : (
            shelves.map((sh) => (
              <section className="den-home-section" key={sh.artist}>
                <h2>
                  Because your museum has <em>{sh.artist}</em>
                </h2>
                <div className="den-shelf-row">
                  {sh.books.map((r) => (
                    <Card key={r.externalId} r={r} />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}

      {detailBook && (
        <BookDetail
          book={detailBook}
          saved={isSaved(detailBook.externalId)}
          saving={savingId === detailBook.externalId}
          onSave={() => save(detailBook)}
          onRead={() => openBook(detailBook)}
          onClose={() => setDetailBook(null)}
        />
      )}
    </div>
  );
}
