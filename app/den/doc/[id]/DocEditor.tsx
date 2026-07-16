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
    <div className="doc-editor">
      <input
        className="doc-title"
        value={title}
        placeholder="Untitled"
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
      />
      <textarea
        className="doc-body"
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
