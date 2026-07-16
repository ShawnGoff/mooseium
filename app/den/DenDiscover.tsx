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

const SUBJECTS = [
  "Fiction",
  "Poetry",
  "Philosophy",
  "History",
  "Adventure",
  "Science Fiction",
  "Drama",
  "Children",
  "Short Stories",
  "Biography",
  "Mystery",
  "Romance",
  "Fantasy",
  "Horror",
  "Fairy Tales",
  "Travel",
  "Nature",
  "Humor",
];

export default function DenDiscover({
  userId,
  savedIds,
  onSaved,
  onOpenBook,
}: {
  userId: string;
  savedIds: Set<string>;
  onSaved: (b: DenBook) => void;
  onOpenBook?: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [heading, setHeading] = useState("");
  const [searching, setSearching] = useState(false);
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [popular, setPopular] = useState<Result[] | null>(null);
  const [subjectCovers, setSubjectCovers] = useState<Record<string, string>>({});
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
    fetch("/api/den/connected")
      .then((r) => r.json())
      .then((d) => setShelves(d.shelves ?? []))
      .catch(() => setShelves([]));
    fetch("/api/den/books/popular")
      .then((r) => r.json())
      .then((d) => setPopular(d.results ?? []))
      .catch(() => setPopular([]));
  }, []);

  // A representative cover per subject so the category cards are filled out.
  useEffect(() => {
    let cancelled = false;
    SUBJECTS.forEach((s) => {
      fetch(`/api/den/books/search?topic=${encodeURIComponent(s)}`)
        .then((r) => r.json())
        .then((d) => {
          const cover = (d.results ?? []).find((r: Result) => r.coverUrl)?.coverUrl;
          if (!cancelled && cover) setSubjectCovers((p) => ({ ...p, [s]: cover }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
                  key={s}
                  className="den-subject-card"
                  onClick={() => run(`topic=${encodeURIComponent(s)}`, s)}
                  style={
                    subjectCovers[s]
                      ? { backgroundImage: `url(${subjectCovers[s]})` }
                      : undefined
                  }
                >
                  <span>{s}</span>
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
