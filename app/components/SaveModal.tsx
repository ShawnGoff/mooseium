"use client";

// Self-contained "save this piece to a collection" modal. Loads the user's
// collections itself, so any page can drop it in with just a card + onClose.

import { useEffect, useState } from "react";

export type SaveCard = {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
};

type Collection = { id: string; name: string; count?: number };

export default function SaveModal({
  card,
  onClose,
  onSaved,
}: {
  card: SaveCard;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/collections")
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((d) => setCollections(d.collections ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const visible = showAll ? collections : collections.slice(0, 3);
  const hiddenCount = collections.length - visible.length;

  async function saveInto(collectionId: string) {
    setBusy(collectionId);
    setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          museum: card.sourceMuseum,
          objectId: card.museumObjectId,
          collectionId,
        }),
      });
      if (!res.ok) throw new Error();
      setDone(true);
      onSaved?.();
    } catch {
      setError("Could not save. Please try again.");
      setBusy(null);
    }
  }

  async function createAndSave(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusy("new");
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const col = await res.json();
      await saveInto(col.id);
    } catch {
      setError("Could not create the collection.");
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{done ? "Saved ✓" : "Save to a collection"}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="modal-sub">{card.title}</p>

        {done ? (
          <p className="status">Added to your collection.</p>
        ) : (
          <>
            {collections.length > 0 && (
              <>
                <ul className="modal-collections">
                  {visible.map((c) => (
                    <li key={c.id}>
                      <button
                        className="modal-collection"
                        onClick={() => saveInto(c.id)}
                        disabled={busy !== null}
                      >
                        <span>{c.name}</span>
                        <span className="modal-collection-meta">
                          {busy === c.id
                            ? "Saving…"
                            : `${c.count ?? 0} ${
                                (c.count ?? 0) === 1 ? "piece" : "pieces"
                              }`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {collections.length > 3 && (
                  <button
                    type="button"
                    className="modal-more"
                    onClick={() => setShowAll((v) => !v)}
                  >
                    {showAll ? "Show fewer" : `▾ ${hiddenCount} more collections`}
                  </button>
                )}
              </>
            )}

            <div className="modal-divider">
              <span>
                {collections.length > 0 ? "or create new" : "create a collection"}
              </span>
            </div>

            <form className="modal-new" onSubmit={createAndSave}>
              <input
                type="text"
                placeholder="Collection name…"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <button type="submit" disabled={busy !== null || !newName.trim()}>
                {busy === "new" ? "Creating…" : "Create & save"}
              </button>
            </form>
          </>
        )}

        {error && <p className="status error">{error}</p>}
      </div>
    </div>
  );
}
