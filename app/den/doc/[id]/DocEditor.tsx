"use client";

// The writing desk. Title + body with debounced autosave to den_documents.

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function DocEditor({
  id,
  initialTitle,
  initialBody,
}: {
  id: string;
  initialTitle: string;
  initialBody: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [theme, setTheme] = useState<"dark" | "paper">("paper");
  const [fontScale, setFontScale] = useState(1.15);
  const [showSettings, setShowSettings] = useState(false);

  // Shares the reader's saved look (paper/dark + size).
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    // Skip the initial mount so we don't save unchanged content.
    if (first.current) {
      first.current = false;
      return;
    }
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase
        .from("den_documents")
        .update({
          title: title.trim() || "Untitled",
          body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      setStatus(error ? "error" : "saved");
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [title, body, id, supabase]);

  return (
    <div className={`doc-editor doc-${theme}`}>
      <div className="doc-toolbar">
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
      </div>
      <input
        className="doc-title"
        style={{ fontSize: `${(fontScale * 1.4).toFixed(2)}rem` }}
        value={title}
        placeholder="Untitled"
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <textarea
        className="doc-body"
        style={{ fontSize: `${fontScale}rem` }}
        value={body}
        placeholder="Start writing…"
        onChange={(e) => setBody(e.target.value)}
      />
      <p className="doc-status">
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved ✓"
            : status === "error"
              ? "Couldn't save — check your connection."
              : ""}
      </p>
    </div>
  );
}
