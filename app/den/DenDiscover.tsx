"use client";

// The Den's discovery home: search public-domain books, browse by subject, and
// a "Because your museum has…" shelf that connects your collected artists to
// their books. Saving adds a book to your library.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DenBook } from "./DenView";

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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<Set<string>>(new Set());

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    fetch("/api/den/connected")
      .then((r) => r.json())
      .then((d) => setShelves(d.shelves ?? []))
      .catch(() => setShelves([]));
  }, []);

  const isSaved = (id: string) => savedIds.has(id) || justSaved.has(id);

  async function run(params: string, label: string) {
    setSearching(true);
    setHeading(label);
    try {
      const res = await fetch(`/api/den/books/search?${params}`);
      const d = await res.json();
      setResults(d.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
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

  function Card({ r }: { r: Result }) {
    const saved = isSaved(r.externalId);
    return (
      <div className="den-book-card">
        <div className="den-cover">
          {r.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.coverUrl} alt="" loading="lazy" />
          ) : (
            <span className="den-cover-fallback">📖</span>
          )}
        </div>
        <div className="den-card-title" title={r.title}>
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
            <div className="den-grid">
              {results.map((r) => (
                <Card key={r.externalId} r={r} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          <section className="den-home-section">
            <h2>Browse by subject</h2>
            <div className="den-subject-chips">
              {SUBJECTS.map((s) => (
                <button key={s} onClick={() => run(`topic=${encodeURIComponent(s)}`, s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>

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
    </div>
  );
}
