"use client";

// A book placard — like the museum's art placard. Cover, author, subjects,
// popularity, and a description (from Open Library), with Save + Read actions.

import { useEffect, useState } from "react";

export type DiscoverBook = {
  source: string;
  externalId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
};

type Detail = {
  subjects: string[];
  downloads: number | null;
  description: string | null;
};

export default function BookDetail({
  book,
  saved,
  saving,
  onSave,
  onRead,
  onClose,
}: {
  book: DiscoverBook;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
  onRead: () => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    let alive = true;
    // Fetch metadata straight from Gutendex + Open Library in the browser —
    // both allow CORS, and this dodges the datacenter block on our server.
    (async () => {
      let subjects: string[] = [];
      let downloads: number | null = null;
      let title = book.title;
      let author = book.author ?? "";
      try {
        const r = await fetch(`https://gutendex.com/books/${book.externalId}`);
        if (r.ok) {
          const m = (await r.json()) as {
            title?: string;
            authors?: { name: string }[];
            subjects?: string[];
            download_count?: number;
          };
          title = m.title || title;
          author = m.authors?.[0]?.name ?? author;
          downloads = m.download_count ?? null;
          subjects = Array.from(
            new Set((m.subjects ?? []).map((s) => s.split(" -- ")[0].trim()))
          )
            .filter(Boolean)
            .slice(0, 6);
        }
      } catch {
        /* subjects/downloads just stay empty */
      }
      let description: string | null = null;
      try {
        const params = new URLSearchParams({ title, limit: "1" });
        if (author) params.set("author", author);
        const sr = await fetch(
          `https://openlibrary.org/search.json?${params}&fields=key,first_sentence`
        );
        if (sr.ok) {
          const sd = (await sr.json()) as {
            docs?: { key?: string; first_sentence?: string[] | { value: string } }[];
          };
          const doc = sd.docs?.[0];
          const fs = doc?.first_sentence;
          if (Array.isArray(fs)) description = fs[0] ?? null;
          else if (fs && typeof fs === "object") description = fs.value ?? null;
        }
      } catch {
        /* no description */
      }
      if (description) description = description.split(/\n\s*[-([]/)[0].trim().slice(0, 900);
      if (alive) setDetail({ subjects, downloads, description });
    })();
    return () => {
      alive = false;
    };
  }, [book.externalId, book.title, book.author]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal book-detail"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="book-detail-body">
          <div className="book-detail-cover">
            {book.coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={book.coverUrl} alt="" />
            ) : (
              <span className="den-cover-fallback">📖</span>
            )}
          </div>
          <div className="book-detail-info">
            <h2>{book.title}</h2>
            {book.author && <p className="book-detail-author">{book.author}</p>}

            {detail === null ? (
              <p className="status">Loading details…</p>
            ) : (
              <>
                {detail.description ? (
                  <p className="book-detail-desc">{detail.description}</p>
                ) : (
                  <p className="book-detail-desc muted">
                    No description available for this edition.
                  </p>
                )}
                {detail.subjects.length > 0 && (
                  <div className="book-detail-subjects">
                    {detail.subjects.map((s) => (
                      <span key={s} className="book-detail-chip">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {detail.downloads != null && (
                  <p className="book-detail-meta">
                    {detail.downloads.toLocaleString()} downloads on Project Gutenberg
                  </p>
                )}
              </>
            )}

            <div className="book-detail-actions">
              <button className="book-detail-read" onClick={onRead} disabled={saving}>
                {saving ? "Opening…" : "Read now"}
              </button>
              <button
                className={`book-detail-save${saved ? " saved" : ""}`}
                onClick={onSave}
                disabled={saved || saving}
              >
                {saved ? "✓ In library" : "＋ Save"}
              </button>
            </div>
            <p className="book-detail-source">
              Public-domain text from Project Gutenberg · description via Open Library
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
