"use client";

// A calm, scrollable reader. Loads the text, restores where you left off, and
// saves your place (as a scroll fraction) while you read.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BookReader({
  id,
  gid,
  title,
  author,
  initialPercent,
}: {
  id: string;
  gid: string;
  title: string;
  author: string | null;
  initialPercent: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(initialPercent);

  const supabase = useMemo(() => createClient(), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);

  // Load the text once.
  useEffect(() => {
    let alive = true;
    fetch(`/api/den/books/text?gid=${encodeURIComponent(gid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setText(d.text ?? ""))
      .catch(() => alive && setError("Couldn't load this book's text."));
    return () => {
      alive = false;
    };
  }, [gid]);

  // Once text is in the DOM, jump to the saved place.
  useEffect(() => {
    if (text === null || restored.current) return;
    restored.current = true;
    const el = scrollRef.current;
    if (el && initialPercent > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = initialPercent * (el.scrollHeight - el.clientHeight);
      });
    }
  }, [text, initialPercent]);

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
        <span className="reader-pct">{Math.round(progress * 100)}%</span>
      </header>
      <div className="reader-progress">
        <div
          className="reader-progress-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div className="reader-scroll" ref={scrollRef} onScroll={onScroll}>
        {error ? (
          <p className="status error">{error}</p>
        ) : text === null ? (
          <p className="status">Loading…</p>
        ) : (
          <article className="reader-text">{text}</article>
        )}
      </div>
    </div>
  );
}
