"use client";

// Find public-domain books (Project Gutenberg) and save them into a Den folder.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DenBook, DenFolder } from "./DenView";

type Result = {
  source: string;
  externalId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
};

export default function BookSearch({
  userId,
  folders,
  onSaved,
  onClose,
}: {
  userId: string;
  folders: DenFolder[];
  onSaved: (book: DenBook) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [folderId, setFolderId] = useState<string>("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/den/books/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok) throw new Error();
      setResults(data.results ?? []);
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  async function save(r: Result) {
    setSavingId(r.externalId);
    setError(null);
    const { data, error } = await supabase
      .from("den_books")
      .insert({
        user_id: userId,
        folder_id: folderId || null,
        source: r.source,
        external_id: r.externalId,
        title: r.title,
        author: r.author,
        cover_url: r.coverUrl,
      })
      .select("id, folder_id, title, author")
      .single();
    setSavingId(null);
    if (error) {
      // 23505 = already saved this book.
      setError(error.code === "23505" ? "Already in your Den." : "Could not save.");
      return;
    }
    setSavedIds((s) => new Set(s).add(r.externalId));
    if (data) onSaved(data as DenBook);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal den-books-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>Find books</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="modal-sub">Public-domain books from Project Gutenberg.</p>

        <form className="den-book-search" onSubmit={search}>
          <input
            type="text"
            placeholder="Search by title or author…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={searching || !q.trim()}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        <label className="den-book-folder">
          Save to:
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Top level</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        <ul className="den-book-results">
          {results.map((r) => (
            <li key={r.externalId}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {r.coverUrl ? (
                <img src={r.coverUrl} alt="" loading="lazy" />
              ) : (
                <div className="den-book-nocover">📖</div>
              )}
              <div className="den-book-info">
                <span className="den-book-title">{r.title}</span>
                {r.author && <span className="den-book-author">{r.author}</span>}
              </div>
              <button
                onClick={() => save(r)}
                disabled={savingId !== null || savedIds.has(r.externalId)}
              >
                {savedIds.has(r.externalId)
                  ? "Saved ✓"
                  : savingId === r.externalId
                    ? "Saving…"
                    : "Save"}
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="status error">{error}</p>}
      </div>
    </div>
  );
}
