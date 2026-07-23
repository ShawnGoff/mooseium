"use client";

// The Den as an in-place overlay — opens on top of the 3D museum so you never
// leave your room. Hosts the library grid, the reader, and the writing desk,
// switching between them without navigating away.

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import DenView, { type DenBook, type DenDoc, type DenFolder } from "./DenView";
import DocEditor from "./doc/[id]/DocEditor";
import BookReader from "./book/[id]/BookReader";

type View =
  | { kind: "list" }
  | { kind: "doc"; id: string }
  | { kind: "book"; id: string };

type DocRow = { id: string; title: string; body: string };
type BookRow = {
  id: string;
  external_id: string;
  title: string | null;
  author: string | null;
  progress: { percent?: number } | null;
  note_document_id: string | null;
};

export default function DenPanel({
  initialTab,
  onClose,
}: {
  initialTab: "library" | "writing";
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [data, setData] = useState<{
    folders: DenFolder[];
    books: DenBook[];
    docs: DenDoc[];
  } | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [doc, setDoc] = useState<DocRow | null>(null);
  const [book, setBook] = useState<BookRow | null>(null);
  const [authError, setAuthError] = useState(false);

  // Load user + library once.
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthError(true);
        return;
      }
      setUserId(user.id);
      const [f, b, d] = await Promise.all([
        supabase.from("den_folders").select("id, parent_folder_id, name, sort, surface").order("sort"),
        supabase
          .from("den_books")
          .select("id, folder_id, title, author, cover_url, external_id, progress")
          .order("created_at", { ascending: false }),
        supabase
          .from("den_documents")
          .select("id, folder_id, title, updated_at")
          .order("updated_at", { ascending: false }),
      ]);
      setData({
        folders: (f.data as DenFolder[]) ?? [],
        books: (b.data as DenBook[]) ?? [],
        docs: (d.data as DenDoc[]) ?? [],
      });
    })();
  }, [supabase]);

  // Fetch the open document / book when the view changes.
  useEffect(() => {
    if (view.kind === "doc") {
      setDoc(null);
      supabase
        .from("den_documents")
        .select("id, title, body")
        .eq("id", view.id)
        .single()
        .then(({ data }) => setDoc((data as DocRow) ?? null));
    } else if (view.kind === "book") {
      setBook(null);
      supabase
        .from("den_books")
        .select("id, external_id, title, author, progress, note_document_id")
        .eq("id", view.id)
        .single()
        .then(({ data }) => setBook((data as BookRow) ?? null));
    }
  }, [view, supabase]);

  const back = () => setView({ kind: "list" });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (view.kind !== "list") setView({ kind: "list" });
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, onClose]);

  return (
    <div className="den-panel">
      <div className="den-panel-head">
        <span className="den-panel-title">The Library</span>
        <button className="den-panel-close" onClick={onClose} aria-label="Back to museum">
          ✕ Back to museum
        </button>
      </div>

      <div className="den-panel-body">
        {view.kind === "list" ? (
          authError ? (
            <p className="status">
              Your session expired. Please{" "}
              <a href="/login">sign in</a> again to open your library.
            </p>
          ) : !data || !userId ? (
            <p className="status">Opening your study…</p>
          ) : (
            <div className="container">
              <DenView
                userId={userId}
                initialFolders={data.folders}
                initialBooks={data.books}
                initialDocs={data.docs}
                initialTab={initialTab}
                onOpenBook={(id) => setView({ kind: "book", id })}
                onOpenDoc={(id) => setView({ kind: "doc", id })}
              />
            </div>
          )
        ) : view.kind === "doc" ? (
          !doc ? (
            <p className="status">Opening…</p>
          ) : (
            <div className="container">
              <p className="den-back">
                <button className="reader-back" onClick={back}>
                  ← Back
                </button>
              </p>
              <DocEditor id={doc.id} initialTitle={doc.title} initialBody={doc.body} />
            </div>
          )
        ) : !book || !userId ? (
          <p className="status">Opening…</p>
        ) : (
          <BookReader
            id={book.id}
            userId={userId}
            gid={book.external_id}
            title={book.title ?? "Untitled"}
            author={book.author}
            initialPercent={
              typeof book.progress?.percent === "number" ? book.progress.percent : 0
            }
            initialNoteDocId={book.note_document_id}
            onBack={back}
            onOpenDoc={(id) => setView({ kind: "doc", id })}
          />
        )}
      </div>
    </div>
  );
}
