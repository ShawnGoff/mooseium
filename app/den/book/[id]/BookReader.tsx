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
  onBack,
  onOpenDoc,
  backHref = "/den",
}: {
  // In public (signed-out) mode id and userId are null: progress is kept in
  // localStorage and note-saving is replaced with a sign-in prompt.
  id: string | null;
  userId: string | null;
  gid: string;
  title: string;
  author: string | null;
  initialPercent: number;
  initialNoteDocId: string | null;
  // Embedded (overlay) mode: use callbacks instead of navigating.
  onBack?: () => void;
  onOpenDoc?: (id: string) => void;
  backHref?: string;
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
  const [theme, setTheme] = useState<"dark" | "paper">("paper");
  const [fontScale, setFontScale] = useState(1.15);
  const [showSettings, setShowSettings] = useState(false);

  // Reading prefs persist across books.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("den-reader-prefs");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.theme === "paper" || p.theme === "dark") setTheme(p.theme);
        if (typeof p.fontScale === "number") setFontScale(p.fontScale);
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("den-reader-prefs", JSON.stringify({ theme, fontScale }));
    } catch {
      /* ignore */
    }
  }, [theme, fontScale]);

  const supabase = useMemo(() => createClient(), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restored = useRef(false);
  const userInteracted = useRef(false);
  const lastPct = useRef(initialPercent);
  // Where reading resumes. In public mode we seed it from localStorage on mount.
  const startPct = useRef(initialPercent);
  const progKey = `den-progress-${gid}`;

  // Public mode: restore the saved place from localStorage (no DB row).
  useEffect(() => {
    if (id) return;
    try {
      const v = localStorage.getItem(progKey);
      if (v) {
        const p = Math.min(1, Math.max(0, parseFloat(v)));
        startPct.current = p;
        lastPct.current = p;
        setProgress(p);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, gid]);

  // Persist the current fraction — to the DB when signed in, else localStorage.
  const persist = useCallback(
    (pct: number) => {
      if (id) {
        supabase
          .from("den_books")
          .update({ progress: { percent: pct } })
          .eq("id", id)
          .then(() => {});
      } else {
        try {
          localStorage.setItem(progKey, String(pct));
        } catch {
          /* ignore */
        }
      }
    },
    [id, supabase, progKey]
  );

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

  // Restore the saved place. The rich HTML keeps growing as images load, so a
  // single jump lands too high — re-apply on a few ticks and on each image load
  // until the user scrolls, then stop.
  useEffect(() => {
    if (content === null || restored.current) return;
    restored.current = true;
    const el = scrollRef.current;
    if (!el || startPct.current <= 0) return;
    const apply = () => {
      if (userInteracted.current) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) el.scrollTop = startPct.current * max;
    };
    apply();
    const timers = [80, 300, 700, 1400, 2500].map((ms) => setTimeout(apply, ms));
    const imgs = Array.from(el.querySelectorAll("img"));
    imgs.forEach((im) => im.addEventListener("load", apply));
    return () => {
      timers.forEach(clearTimeout);
      imgs.forEach((im) => im.removeEventListener("load", apply));
    };
  }, [content]);

  // Save the latest position when the reader unmounts (closing before the
  // debounce fires would otherwise lose the last few seconds of reading).
  useEffect(
    () => () => {
      persist(lastPct.current);
    },
    [persist]
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max > 0 ? Math.min(1, el.scrollTop / max) : 0;
    setProgress(pct);
    lastPct.current = pct;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persist(pct), 800);
  }, [persist]);

  // Jump by a fraction (±5% buttons) or to an absolute fraction (progress bar).
  function seekBy(delta: number) {
    seekTo(progress + delta);
  }
  function seekTo(fraction: number) {
    const el = scrollRef.current;
    if (!el) return;
    userInteracted.current = true;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) el.scrollTop = Math.max(0, Math.min(1, fraction)) * max;
  }

  // Page a screenful at a time — the familiar reading gesture.
  const pageBy = useCallback((dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    userInteracted.current = true;
    el.scrollBy({ top: dir * el.clientHeight * 0.88, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === " " || e.key === "PageDown" || e.key === "ArrowDown") {
        e.preventDefault();
        pageBy(e.shiftKey && e.key === " " ? -1 : 1);
      } else if (e.key === "PageUp" || e.key === "ArrowUp") {
        e.preventDefault();
        pageBy(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pageBy]);

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
    <div className={`reader reader-${theme}`}>
      <header className="reader-bar">
        {onBack ? (
          <button className="reader-back" onClick={onBack}>
            ← Back
          </button>
        ) : (
          <Link href={backHref} className="reader-back">
            ← {backHref === "/library" ? "Library" : "The Library"}
          </Link>
        )}
        <div className="reader-meta">
          <span className="reader-title">{title}</span>
          {author && <span className="reader-author">{author}</span>}
        </div>
        {noteDocId &&
          (onOpenDoc ? (
            <button
              className="reader-notes-link"
              onClick={() => onOpenDoc(noteDocId)}
            >
              📝 Notes
            </button>
          ) : (
            <Link href={`/den/doc/${noteDocId}`} className="reader-notes-link">
              📝 Notes
            </Link>
          ))}
        <button
          className="reader-theme-toggle"
          onClick={() => setTheme((t) => (t === "paper" ? "dark" : "paper"))}
          title="Switch theme"
        >
          {theme === "paper" ? "☾ Dark" : "☀ Paper"}
        </button>
        <div className="reader-settings-wrap">
          <button
            className="reader-aa"
            onClick={() => setShowSettings((v) => !v)}
            aria-label="Text size"
            title="Text size"
          >
            Aa
          </button>
          {showSettings && (
            <div className="reader-settings">
              <div className="reader-settings-row">
                <span>Text size</span>
                <div className="reader-font-btns">
                  <button onClick={() => setFontScale((f) => Math.max(0.9, +(f - 0.05).toFixed(2)))}>
                    A−
                  </button>
                  <button onClick={() => setFontScale((f) => Math.min(1.7, +(f + 0.05).toFixed(2)))}>
                    A+
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="reader-seek">
          <button onClick={() => seekBy(-0.05)} aria-label="Back 5%" title="Back 5%">
            −5%
          </button>
          <span className="reader-pct">{Math.round(progress * 100)}%</span>
          <button onClick={() => seekBy(0.05)} aria-label="Forward 5%" title="Forward 5%">
            +5%
          </button>
        </div>
      </header>
      <div
        className="reader-progress"
        title="Click to jump"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          seekTo((e.clientX - r.left) / r.width);
        }}
      >
        <div
          className="reader-progress-fill"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <div
        className="reader-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={() => (userInteracted.current = true)}
        onPointerDown={() => (userInteracted.current = true)}
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
            style={{ fontSize: `${fontScale}rem` }}
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        ) : (
          <article className="reader-text" style={{ fontSize: `${fontScale}rem` }}>
            {content.text}
          </article>
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
              {userId ? (
                <button onClick={saveHighlight} disabled={saving}>
                  {saving ? "Saving…" : "＋ Save to notes"}
                </button>
              ) : (
                <Link href="/login" className="reader-signin-note">
                  Sign in to save notes
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
