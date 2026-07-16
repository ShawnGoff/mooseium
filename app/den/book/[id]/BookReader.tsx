"use client";

// A calm, scrollable reader. Loads the text, restores where you left off, and
// saves your place (as a scroll fraction) while you read.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BookReader({
  id,
  userId,
  gid,
  title,
  author,
  initialPercent,
  initialNoteDocId,
}: {
  id: string;
  userId: string;
  gid: string;
  title: string;
  author: string | null;
  initialPercent: number;
  initialNoteDocId: string | null;
}) {
  const [content, setContent] = useState<
    { html: string } | { text: string } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(initialPercent);
  const [selection, setSelection] = useState("");
  const [noteDocId, setNoteDocId] = useState<string | null>(initialNoteDocId);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);

  // Load the illustrated HTML; fall back to plain text if unavailable.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/den/books/content?gid=${encodeURIComponent(gid)}`);
        if (r.ok) {
          const d = await r.json();
          if (alive) setContent({ html: d.html ?? "" });
          return;
        }
      } catch {
        /* fall through to plain text */
      }
      try {
        const r = await fetch(`/api/den/books/text?gid=${encodeURIComponent(gid)}`);
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (alive) setContent({ text: d.text ?? "" });
      } catch {
        if (alive) setError("Couldn't load this book.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [gid]);

  // Once content is in the DOM, jump to the saved place.
  useEffect(() => {
    if (content === null || restored.current) return;
    restored.current = true;
    const el = scrollRef.current;
    if (el && initialPercent > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = initialPercent * (el.scrollHeight - el.clientHeight);
      });
    }
  }, [content, initialPercent]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max > 0 ? Math.min(1, el.scrollTop / max) : 0;
    setProgress(pct);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase
        .from("den_books")
        .update({ progress: { percent: pct } })
        .eq("id", id)
        .then(() => {});
    }, 800);
  }, [id, supabase]);

  function captureSelection() {
    const s = window.getSelection()?.toString().trim() ?? "";
    setSelection(s.length > 1 ? s : "");
  }

  async function saveHighlight() {
    const quote = selection.trim();
    if (!quote) return;
    setSaving(true);
    setFlash(null);
    try {
      if (!noteDocId) {
        const { data, error } = await supabase
          .from("den_documents")
          .insert({
            user_id: userId,
            title: `Notes — ${title}`.slice(0, 200),
            body: `“${quote}”`,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error();
        await supabase
          .from("den_books")
          .update({ note_document_id: data.id })
          .eq("id", id);
        setNoteDocId(data.id);
      } else {
        const { data } = await supabase
          .from("den_documents")
          .select("body")
          .eq("id", noteDocId)
          .single();
        const body = `${data?.body ?? ""}\n\n“${quote}”`;
        await supabase
          .from("den_documents")
          .update({ body, updated_at: new Date().toISOString() })
          .eq("id", noteDocId);
      }
      setSelection("");
      window.getSelection()?.removeAllRanges();
      setFlash("Saved to notes ✓");
      setTimeout(() => setFlash(null), 1600);
    } catch {
      setFlash("Couldn't save that highlight.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="reader">
      <header className="reader-bar">
        <Link href="/den" className="reader-back">
          ← The Den
        </Link>
        <div className="reader-meta">
          <span className="reader-title">{title}</span>
          {author && <span className="reader-author">{author}</span>}
        </div>
        {noteDocId && (
          <Link href={`/den/doc/${noteDocId}`} className="reader-notes-link">
            📝 Notes
          </Link>
        )}
        <span className="reader-pct">{Math.round(progress * 100)}%</span>
      </header>
      <div className="reader-progress">
        <div
          className="reader-progress-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div
        className="reader-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onMouseUp={captureSelection}
        onTouchEnd={captureSelection}
      >
        {error ? (
          <p className="status error">{error}</p>
        ) : content === null ? (
          <p className="status">Loading…</p>
        ) : "html" in content ? (
          <article
            className="reader-text reader-rich"
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        ) : (
          <article className="reader-text">{content.text}</article>
        )}
      </div>

      {(selection || flash) && (
        <div className="reader-highlight-bar">
          {flash ? (
            <span className="reader-flash">{flash}</span>
          ) : (
            <>
              <span className="reader-quote">“{selection.slice(0, 80)}
                {selection.length > 80 ? "…" : ""}”</span>
              <button onClick={saveHighlight} disabled={saving}>
                {saving ? "Saving…" : "＋ Save to notes"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
