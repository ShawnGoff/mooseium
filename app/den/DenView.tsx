"use client";

// The Den directory: a nested folder tree holding saved books and documents.
// Talks to Supabase directly (RLS keeps every row owner-private).

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
};
export type DenDoc = {
  id: string;
  folder_id: string | null;
  title: string;
  updated_at: string;
};

export default function DenView({
  userId,
  initialFolders,
  initialBooks,
  initialDocs,
}: {
  userId: string;
  initialFolders: DenFolder[];
  initialBooks: DenBook[];
  initialDocs: DenDoc[];
}) {
  const [folders, setFolders] = useState<DenFolder[]>(initialFolders);
  const [books, setBooks] = useState<DenBook[]>(initialBooks);
  const [docs] = useState<DenDoc[]>(initialDocs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [findBooks, setFindBooks] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  async function createDocument(parentId: string | null) {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("den_documents")
      .insert({ user_id: userId, folder_id: parentId, title: "Untitled" })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      setError("Could not create the note.");
      return;
    }
    router.push(`/den/doc/${data.id}`);
  }

  // Group children by parent for recursive rendering.
  const childFolders = useMemo(() => {
    const map = new Map<string | null, DenFolder[]>();
    for (const f of folders) {
      const key = f.parent_folder_id;
      (map.get(key) ?? map.set(key, []).get(key)!).push(f);
    }
    return map;
  }, [folders]);

  const booksIn = (folderId: string | null) =>
    books.filter((b) => b.folder_id === folderId);
  const docsIn = (folderId: string | null) =>
    docs.filter((d) => d.folder_id === folderId);

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
    if (error || !data) {
      setError("Could not create the folder.");
      return;
    }
    setFolders((f) => [...f, data as DenFolder]);
  }

  async function renameFolder(folder: DenFolder) {
    const name = window.prompt("Rename folder", folder.name)?.trim();
    if (!name || name === folder.name) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("den_folders")
      .update({ name })
      .eq("id", folder.id);
    setBusy(false);
    if (error) {
      setError("Could not rename the folder.");
      return;
    }
    setFolders((f) => f.map((x) => (x.id === folder.id ? { ...x, name } : x)));
  }

  async function deleteFolder(folder: DenFolder) {
    const kids = childFolders.get(folder.id)?.length ?? 0;
    const msg =
      kids > 0
        ? `Delete "${folder.name}" and its ${kids} subfolder(s)? Books and documents inside move to the top level.`
        : `Delete "${folder.name}"? Books and documents inside move to the top level.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from("den_folders")
      .delete()
      .eq("id", folder.id);
    setBusy(false);
    if (error) {
      setError("Could not delete the folder.");
      return;
    }
    // Remove the folder and any descendants from local state.
    const removed = new Set<string>();
    const collect = (id: string) => {
      removed.add(id);
      for (const c of folders.filter((x) => x.parent_folder_id === id))
        collect(c.id);
    };
    collect(folder.id);
    setFolders((f) => f.filter((x) => !removed.has(x.id)));
  }

  function Tree({ parentId }: { parentId: string | null }) {
    const kids = childFolders.get(parentId) ?? [];
    const looseBooks = booksIn(parentId);
    const looseDocs = docsIn(parentId);
    return (
      <ul className="den-tree">
        {kids.map((f) => (
          <li key={f.id} className="den-folder">
            <div className="den-row">
              <span className="den-name">📁 {f.name}</span>
              <span className="den-actions">
                <button onClick={() => createFolder(f.id)} disabled={busy}>
                  ＋ folder
                </button>
                <button onClick={() => createDocument(f.id)} disabled={busy}>
                  ＋ note
                </button>
                <button onClick={() => renameFolder(f)} disabled={busy}>
                  rename
                </button>
                <button onClick={() => deleteFolder(f)} disabled={busy}>
                  delete
                </button>
              </span>
            </div>
            <Tree parentId={f.id} />
          </li>
        ))}
        {looseBooks.map((b) => (
          <li key={b.id} className="den-leaf">
            📖 {b.title || "Untitled book"}
            {b.author ? <span className="den-meta"> · {b.author}</span> : null}
          </li>
        ))}
        {looseDocs.map((d) => (
          <li key={d.id} className="den-leaf">
            <a className="den-doc-link" href={`/den/doc/${d.id}`}>
              ✍️ {d.title || "Untitled"}
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="den">
      <div className="den-toolbar">
        <button onClick={() => createFolder(null)} disabled={busy}>
          ＋ New folder
        </button>
        <button onClick={() => createDocument(null)} disabled={busy}>
          ＋ New note
        </button>
        <button onClick={() => setFindBooks(true)} disabled={busy}>
          🔎 Find books
        </button>
      </div>
      <Tree parentId={null} />
      {folders.length === 0 && books.length === 0 && docs.length === 0 && (
        <p className="status">
          Empty study. Make a folder to start organizing your books and writing.
        </p>
      )}
      {error && <p className="status error">{error}</p>}

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
