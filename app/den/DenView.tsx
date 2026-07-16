"use client";

// The Den library. Folder sidebar + a cover-forward grid, split into Library
// (books) and Writing (documents) tabs. Drag any card onto a folder to file it.
// Everything talks to Supabase directly; RLS keeps rows owner-private.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BookSearch from "./BookSearch";

export type DenFolder = {
  id: string;
  parent_folder_id: string | null;
  name: string;
  sort: number;
};
export type DenBook = {
  id: string;
  folder_id: string | null;
  title: string | null;
  author: string | null;
  cover_url: string | null;
};
export type DenDoc = {
  id: string;
  folder_id: string | null;
  title: string;
  updated_at: string;
};

type Drag = { kind: "book" | "doc"; id: string } | null;

export default function DenView({
  userId,
  initialFolders,
  initialBooks,
  initialDocs,
  initialTab = "library",
  onOpenBook,
  onOpenDoc,
}: {
  userId: string;
  initialFolders: DenFolder[];
  initialBooks: DenBook[];
  initialDocs: DenDoc[];
  initialTab?: "library" | "writing";
  // When provided (overlay/embedded mode), open in-place instead of navigating.
  onOpenBook?: (id: string) => void;
  onOpenDoc?: (id: string) => void;
}) {
  const [folders, setFolders] = useState<DenFolder[]>(initialFolders);
  const [books, setBooks] = useState<DenBook[]>(initialBooks);
  const [docs, setDocs] = useState<DenDoc[]>(initialDocs);
  const [tab, setTab] = useState<"library" | "writing">(initialTab);
  const [activeFolder, setActiveFolder] = useState<string | null>(null); // null = All
  const [drag, setDrag] = useState<Drag>(null);
  const [dropTarget, setDropTarget] = useState<string | "all" | null>(null);
  const [findBooks, setFindBooks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const childMap = useMemo(() => {
    const m = new Map<string | null, DenFolder[]>();
    for (const f of folders) {
      const k = f.parent_folder_id;
      (m.get(k) ?? m.set(k, []).get(k)!).push(f);
    }
    return m;
  }, [folders]);

  const countIn = (fid: string) =>
    books.filter((b) => b.folder_id === fid).length +
    docs.filter((d) => d.folder_id === fid).length;

  const shownBooks =
    activeFolder === null ? books : books.filter((b) => b.folder_id === activeFolder);
  const shownDocs =
    activeFolder === null ? docs : docs.filter((d) => d.folder_id === activeFolder);

  // ---- folder CRUD ----
  async function createFolder(parentId: string | null) {
    const name = window.prompt("New folder name")?.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("den_folders")
      .insert({ user_id: userId, parent_folder_id: parentId, name })
      .select("id, parent_folder_id, name, sort")
      .single();
    setBusy(false);
    if (error || !data) return setError("Could not create the folder.");
    setFolders((f) => [...f, data as DenFolder]);
  }

  async function renameFolder(folder: DenFolder) {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (!name || name === folder.name) return;
    const { error } = await supabase
      .from("den_folders")
      .update({ name })
      .eq("id", folder.id);
    if (error) return setError("Could not rename the folder.");
    setFolders((f) => f.map((x) => (x.id === folder.id ? { ...x, name } : x)));
  }

  async function deleteFolder(folder: DenFolder) {
    if (!window.confirm(`Delete "${folder.name}"? Items inside move to All.`)) return;
    const { error } = await supabase.from("den_folders").delete().eq("id", folder.id);
    if (error) return setError("Could not delete the folder.");
    const removed = new Set<string>();
    const collect = (id: string) => {
      removed.add(id);
      for (const c of folders.filter((x) => x.parent_folder_id === id)) collect(c.id);
    };
    collect(folder.id);
    setFolders((f) => f.filter((x) => !removed.has(x.id)));
    setBooks((b) =>
      b.map((x) => (x.folder_id && removed.has(x.folder_id) ? { ...x, folder_id: null } : x)),
    );
    setDocs((d) =>
      d.map((x) => (x.folder_id && removed.has(x.folder_id) ? { ...x, folder_id: null } : x)),
    );
    if (activeFolder && removed.has(activeFolder)) setActiveFolder(null);
  }

  async function createDocument() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("den_documents")
      .insert({ user_id: userId, folder_id: activeFolder, title: "Untitled" })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) return setError("Could not create the note.");
    setDocs((d) => [
      { id: data.id, folder_id: activeFolder, title: "Untitled", updated_at: new Date().toISOString() },
      ...d,
    ]);
    openDoc(data.id);
  }

  const openBook = (id: string) =>
    onOpenBook ? onOpenBook(id) : router.push(`/den/book/${id}`);
  const openDoc = (id: string) =>
    onOpenDoc ? onOpenDoc(id) : router.push(`/den/doc/${id}`);

  // ---- drag to file into a folder (or All to unfile) ----
  async function assignTo(folderId: string | null) {
    if (!drag) return;
    const table = drag.kind === "book" ? "den_books" : "den_documents";
    const { error } = await supabase
      .from(table)
      .update({ folder_id: folderId })
      .eq("id", drag.id);
    if (error) {
      setError("Could not move that.");
      return;
    }
    if (drag.kind === "book")
      setBooks((b) => b.map((x) => (x.id === drag.id ? { ...x, folder_id: folderId } : x)));
    else setDocs((d) => d.map((x) => (x.id === drag.id ? { ...x, folder_id: folderId } : x)));
  }

  function FolderRows({ parentId, depth }: { parentId: string | null; depth: number }) {
    const rows = childMap.get(parentId) ?? [];
    return (
      <>
        {rows.map((f) => (
          <div key={f.id}>
            <div
              className={`den-side-row${activeFolder === f.id ? " active" : ""}${
                dropTarget === f.id ? " drop" : ""
              }`}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => setActiveFolder(f.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTarget(f.id);
              }}
              onDragLeave={() => setDropTarget((t) => (t === f.id ? null : t))}
              onDrop={() => {
                assignTo(f.id);
                setDropTarget(null);
              }}
            >
              <span className="den-side-name">📁 {f.name}</span>
              <span className="den-side-count">{countIn(f.id) || ""}</span>
              <span className="den-side-actions">
                <button title="New subfolder" onClick={(e) => (e.stopPropagation(), createFolder(f.id))}>
                  ＋
                </button>
                <button title="Rename" onClick={(e) => (e.stopPropagation(), renameFolder(f))}>
                  ✎
                </button>
                <button title="Delete" onClick={(e) => (e.stopPropagation(), deleteFolder(f))}>
                  🗑
                </button>
              </span>
            </div>
            <FolderRows parentId={f.id} depth={depth + 1} />
          </div>
        ))}
      </>
    );
  }

  const cardDrag = (kind: "book" | "doc", id: string) => ({
    draggable: true,
    onDragStart: () => setDrag({ kind, id }),
    onDragEnd: () => {
      setDrag(null);
      setDropTarget(null);
    },
  });

  return (
    <div className="den2">
      <aside className="den-sidebar">
        <div
          className={`den-side-row${activeFolder === null ? " active" : ""}${
            dropTarget === "all" ? " drop" : ""
          }`}
          onClick={() => setActiveFolder(null)}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget("all");
          }}
          onDragLeave={() => setDropTarget((t) => (t === "all" ? null : t))}
          onDrop={() => {
            assignTo(null);
            setDropTarget(null);
          }}
        >
          <span className="den-side-name">🗂 All items</span>
        </div>
        <FolderRows parentId={null} depth={0} />
        <button className="den-side-new" onClick={() => createFolder(null)} disabled={busy}>
          ＋ New folder
        </button>
      </aside>

      <section className="den-main">
        <div className="den-tabs">
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            📚 Library
          </button>
          <button
            className={tab === "writing" ? "active" : ""}
            onClick={() => setTab("writing")}
          >
            ✍️ Writing
          </button>
          <div className="den-main-actions">
            {tab === "library" ? (
              <button onClick={() => setFindBooks(true)}>🔎 Find books</button>
            ) : (
              <button onClick={createDocument} disabled={busy}>
                ＋ New note
              </button>
            )}
          </div>
        </div>

        {tab === "library" ? (
          shownBooks.length === 0 ? (
            <p className="status">No books here yet. Use “Find books” to add some.</p>
          ) : (
            <div className="den-grid">
              {shownBooks.map((b) => (
                <div
                  key={b.id}
                  className="den-book-card"
                  {...cardDrag("book", b.id)}
                  onClick={() => openBook(b.id)}
                >
                  <div className="den-cover">
                    {b.cover_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={b.cover_url} alt="" loading="lazy" />
                    ) : (
                      <span className="den-cover-fallback">📖</span>
                    )}
                  </div>
                  <div className="den-card-title" title={b.title ?? ""}>
                    {b.title || "Untitled"}
                  </div>
                  {b.author && <div className="den-card-sub">{b.author}</div>}
                </div>
              ))}
            </div>
          )
        ) : shownDocs.length === 0 ? (
          <p className="status">Nothing written here yet. Start a new note.</p>
        ) : (
          <div className="den-grid">
            {shownDocs.map((d) => (
              <div
                key={d.id}
                className="den-doc-card"
                {...cardDrag("doc", d.id)}
                onClick={() => openDoc(d.id)}
              >
                <div className="den-doc-page">✍️</div>
                <div className="den-card-title" title={d.title}>
                  {d.title || "Untitled"}
                </div>
              </div>
            ))}
          </div>
        )}

        {error && <p className="status error">{error}</p>}
      </section>

      {findBooks && (
        <BookSearch
          userId={userId}
          folders={folders}
          onSaved={(b) => setBooks((prev) => [...prev, b])}
          onClose={() => setFindBooks(false)}
        />
      )}
    </div>
  );
}
