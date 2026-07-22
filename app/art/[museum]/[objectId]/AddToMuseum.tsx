"use client";

// The "Add this to your museum" action on an artwork page.
// Signed out → sends people to sign up. Signed in → pick a collection (or make
// one) and save the piece without leaving the page.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Collection = { id: string; name: string };

export default function AddToMuseum({
  museum,
  objectId,
}: {
  museum: string;
  objectId: string;
}) {
  // Checked here rather than on the server so the page itself stays cacheable
  // (reading cookies server-side would force it dynamic on every view).
  // null = still checking.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured()) return setSignedIn(false);
    createClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(Boolean(data.user)))
      .catch(() => setSignedIn(false));
  }, []);

  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  if (signedIn === false) {
    return (
      <Link href="/login" className="placard-save placard-signin">
        Sign up / Sign in to save
      </Link>
    );
  }

  async function openPicker() {
    setOpen(true);
    setError(null);
    if (collections) return;
    try {
      const res = await fetch("/api/collections");
      const d = await res.json();
      setCollections(d.collections ?? []);
    } catch {
      setError("Couldn't load your collections.");
      setCollections([]);
    }
  }

  async function save(collectionId: string, label: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ museum, objectId, collectionId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not save that piece.");
      setSaved(label);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAndSave() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.collection?.id) {
        throw new Error(d.error || "Could not create that collection.");
      }
      await save(d.collection.id, name);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <span className="art-save-done">
        ✓ Saved to <Link href="/collections">{saved}</Link>
      </span>
    );
  }

  return (
    <div className="art-save-wrap">
      {!open ? (
        <button className="placard-save" onClick={openPicker} disabled={signedIn === null}>
          ＋ Add this to your museum
        </button>
      ) : (
        <div className="art-save-picker">
          <p className="art-save-label">Save to…</p>
          {collections === null ? (
            <p className="status">Loading your collections…</p>
          ) : (
            <>
              {collections.map((c) => (
                <button
                  key={c.id}
                  className="art-save-option"
                  disabled={busy}
                  onClick={() => save(c.id, c.name)}
                >
                  {c.name}
                </button>
              ))}
              <div className="art-save-new">
                <input
                  type="text"
                  placeholder="Or new collection…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createAndSave()}
                />
                <button disabled={busy || !newName.trim()} onClick={createAndSave}>
                  {busy ? "Saving…" : "Create & save"}
                </button>
              </div>
            </>
          )}
          <button className="text-link" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="status error">{error}</p>}
    </div>
  );
}
