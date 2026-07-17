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
];
const subjectCover = (id: number) =>
  `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`;

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

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  useEffect(() => {
    // The "connected to your art" shelf needs a signed-in user's collection.
    if (!userId) {
      setShelves([]);
    } else if (shelvesCache === null) {
      fetch("/api/den/connected")
        .then((r) => r.json())
        .then((d) => {
          const s = d.shelves ?? [];
          if (s.length) shelvesCache = s; // don't cache an empty/failed result
          setShelves(s);
        })
        .catch(() => setShelves([]));
    }
    if (popularCache === null) {
      fetch("/api/den/books/popular")
        .then((r) => r.json())
        .then((d) => {
          const res = d.results ?? [];
          if (res.length) popularCache = res; // don't cache an empty/failed result
          setPopular(res);
        })
        .catch(() => setPopular([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isSaved = (id: string) => savedIds.has(id) || justSaved.has(id);

  async function run(params: string, label: string) {
    setSearching(true);
    setHeading(label);
    setBaseParams(params);
    setPage(1);
    try {
      const res = await fetch(`/api/den/books/search?${params}&page=1`);
      const d = await res.json();
      setResults(d.results ?? []);
      setHasMore(Boolean(d.hasMore));
    } catch {
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
      const res = await fetch(`/api/den/books/search?${baseParams}&page=${next}`);
      const d = await res.json();
      const more: Result[] = d.results ?? [];
      // De-dupe by id in case pages overlap.
      setResults((prev) => {
        const base = prev ?? [];
        const seen = new Set(base.map((r) => r.externalId));
        return [...base, ...more.filter((r) => !seen.has(r.externalId))];
      });
      setHasMore(Boolean(d.hasMore));
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
    run(`q=${encodeURIComponent(t)}`, `Results for “${t}”`);
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

      {results ? (
        <section className="den-home-section">
          <div className="den-section-head">
            <h2>{heading}</h2>
            <button
              className="text-link"
              onClick={() => {
                setResults(null);
                setHeading("");
              }}
            >
              ← Back to discover
            </button>
          </div>
          {results.length === 0 ? (
            <p className="status">No books found. Try another search.</p>
          ) : (
            <>
              <div className="den-grid">
                {results.map((r) => (
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
