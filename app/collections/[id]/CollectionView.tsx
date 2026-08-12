"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Placard, { type PlacardArtwork } from "@/app/components/Placard";

export type Piece = PlacardArtwork & {
  artworkId: string;
  museumObjectId?: string;
  thumb?: string;
  note?: string;
  isFeature?: boolean;
};

export default function CollectionView({
  galleryId,
  initialName,
  initialIsPublic,
  initialSlug,
  initialGuestbookEnabled,
  initialWing,
  initialInMuseum,
  locationSlot,
  existingWings,
  initialPieces,
}: {
  galleryId: string;
  initialName: string;
  initialIsPublic: boolean;
  initialSlug: string | null;
  initialGuestbookEnabled: boolean;
  initialWing: string | null;
  initialInMuseum: boolean;
  locationSlot: string | null;
  existingWings: string[];
  initialPieces: Piece[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pieces, setPieces] = useState<Piece[]>(initialPieces);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);

  const [guestbookOn, setGuestbookOn] = useState(initialGuestbookEnabled);

  // Whether this collection gets a room of its own in the 3D museum.
  const [inMuseum, setInMuseum] = useState(initialInMuseum);
  async function toggleInMuseum() {
    const next = !inMuseum;
    setInMuseum(next);
    try {
      const res = await fetch(`/api/collections/${galleryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inMuseum: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setInMuseum(!next);
    }
  }

  // Wing assignment: the collection lives in a named wing of the 3D museum.
  const [wing, setWing] = useState<string | null>(initialWing);
  const [wingOptions, setWingOptions] = useState<string[]>(existingWings);
  const [addingWing, setAddingWing] = useState(false);
  const [newWing, setNewWing] = useState("");
  const [wingSaving, setWingSaving] = useState(false);

  async function saveWing(next: string | null) {
    const prev = wing;
    setWing(next); // optimistic
    setWingSaving(true);
    if (next && !wingOptions.includes(next)) {
      setWingOptions((o) => [...o, next].sort((a, b) => a.localeCompare(b)));
    }
    try {
      const res = await fetch(`/api/collections/${galleryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wing: next ?? "" }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setWing(prev); // revert on failure
      setError("Could not update the wing.");
    } finally {
      setWingSaving(false);
    }
  }

  function onWingSelect(value: string) {
    if (value === "__new__") {
      setNewWing("");
      setAddingWing(true);
      return;
    }
    setAddingWing(false);
    saveWing(value || null);
  }

  function confirmNewWing() {
    const name = newWing.trim();
    if (!name) {
      setAddingWing(false);
      return;
    }
    setAddingWing(false);
    saveWing(name);
  }

  const [selected, setSelected] = useState<Piece | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function persistOrder(next: Piece[]) {
    fetch(`/api/collections/${galleryId}/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((p) => p.artworkId) }),
    }).catch(() => {});
  }

  function onDrop(target: number) {
    if (dragIndex === null || dragIndex === target) return;
    setPieces((ps) => {
      const next = [...ps];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(target, 0, moved);
      persistOrder(next);
      return next;
    });
    setDragIndex(null);
  }

  function toggleFeature(p: Piece) {
    const feature = !p.isFeature;
    setPieces((ps) =>
      ps.map((x) => (x.artworkId === p.artworkId ? { ...x, isFeature: feature } : x))
    );
    fetch(`/api/collections/${galleryId}/layout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setFeature: { artworkId: p.artworkId, feature } }),
    }).catch(() => {});
  }

  async function toggleGuestbook() {
    const next = !guestbookOn;
    setGuestbookOn(next);
    try {
      await fetch(`/api/collections/${galleryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestbookEnabled: next }),
      });
    } catch {
      setGuestbookOn(!next); // revert on failure
    }
  }

  const shareUrl =
    slug && typeof window !== "undefined" ? `${location.origin}/g/${slug}` : "";

  async function setPublic(next: boolean) {
    setSharing(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${galleryId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: next }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setIsPublic(data.isPublic);
      if (data.slug) setSlug(data.slug);
    } catch {
      setError("Could not update sharing.");
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function saveName() {
    const next = draftName.trim();
    if (!next || next === name) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${galleryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: next }),
      });
      if (!res.ok) throw new Error();
      setName(next);
      setEditing(false);
    } catch {
      setError("Could not rename the collection.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCollection() {
    if (
      !confirm(
        `Delete "${name}"? This removes the collection (the artworks stay in the catalog).`
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${galleryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/collections");
    } catch {
      setError("Could not delete the collection.");
      setBusy(false);
    }
  }

  async function removePiece(artworkId: string) {
    const prev = pieces;
    setPieces((p) => p.filter((x) => x.artworkId !== artworkId)); // optimistic
    try {
      const res = await fetch(`/api/collections/${galleryId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPieces(prev); // revert on failure
      setError("Could not remove that piece.");
    }
  }

  return (
    <main className="container">
      <p className="status">
        <Link href="/collections">← All collections</Link>
      </p>

      <div className="collection-head">
        {editing ? (
          <div className="rename-row">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
            />
            <button className="link-btn" onClick={saveName} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              className="link-btn"
              onClick={() => {
                setDraftName(name);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="collection-title-row">
            <h1>{name}</h1>
            <span className="tag">
              {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}
            </span>
            <button
              className="link-btn"
              onClick={() => {
                setDraftName(name);
                setEditing(true);
              }}
            >
              Rename
            </button>
            <button className="link-btn danger" onClick={deleteCollection} disabled={busy}>
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="share-bar">
        {isPublic && slug ? (
          <>
            <a className="link-btn" href={`/g/${slug}`} target="_blank" rel="noreferrer">
              View gallery ↗
            </a>
            <input
              className="share-link"
              readOnly
              value={shareUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <button className="link-btn" onClick={copyLink}>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button className="link-btn" onClick={() => setPublic(false)} disabled={sharing}>
              Make private
            </button>
          </>
        ) : (
          <>
            <button
              className="link-btn accent"
              onClick={() => setPublic(true)}
              disabled={sharing}
            >
              {sharing ? "Publishing…" : "Publish & share"}
            </button>
            <span className="share-note">Private — only you can see it</span>
          </>
        )}
      </div>

      {isPublic && (
        <label className="guestbook-toggle">
          <input type="checkbox" checked={guestbookOn} onChange={toggleGuestbook} />
          Allow a guestbook where visitors can sign your gallery
        </label>
      )}

      <div className="wing-bar">
        <span className="wing-label">Wing</span>
        {addingWing ? (
          <>
            <input
              className="wing-input"
              type="text"
              value={newWing}
              onChange={(e) => setNewWing(e.target.value)}
              placeholder="Name this wing…"
              maxLength={60}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmNewWing();
                if (e.key === "Escape") setAddingWing(false);
              }}
            />
            <button className="link-btn" onClick={confirmNewWing} disabled={wingSaving}>
              Add
            </button>
            <button className="link-btn" onClick={() => setAddingWing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <select
              className="wing-select"
              value={wing ?? ""}
              onChange={(e) => onWingSelect(e.target.value)}
              disabled={wingSaving}
            >
              <option value="">Unassigned</option>
              {wingOptions.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
              <option value="__new__">＋ New wing…</option>
            </select>
            <span className="wing-note">
              Groups this collection into a wing of your 3D museum
            </span>
          </>
        )}
      </div>

      {/* A location collection is the 2D home for art hung on one part of the
          museum, so it has no room of its own to show or hide — its pieces are
          already on those walls. Offering the toggle here would only invite the
          curator to turn on a room that duplicates them. */}
      {locationSlot ? (
        <p className="wing-note">
          These pieces hang on your museum walls, so this collection has no room of
          its own. Rearrange them in the museum editor.
        </p>
      ) : (
        <label className="guestbook-toggle">
          <input type="checkbox" checked={inMuseum} onChange={toggleInMuseum} />
          Show this collection in your 3D museum (up to 9 rooms fit — turn some off to
          swap others in)
        </label>
      )}

      {error && <p className="status error">{error}</p>}

      {pieces.length === 0 ? (
        <p className="status">
          This collection is empty. <Link href="/">Find some art</Link> to add.
        </p>
      ) : (
        <>
          <p className="status">Drag to reorder · ★ to feature a piece</p>
          <section className="grid">
            {pieces.map((p, i) => (
              <article
                className={`card${p.isFeature ? " feature" : ""}`}
                key={p.artworkId}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
              >
                <div
                  className="thumb clickable"
                  onClick={() => setSelected(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setSelected(p);
                  }}
                  title="View details"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.thumb && <img src={p.thumb} alt={p.title} loading="lazy" />}
                  <button
                    className={`feature-star${p.isFeature ? " on" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFeature(p);
                    }}
                    title={p.isFeature ? "Featured" : "Feature this piece"}
                    aria-label="Feature this piece"
                  >
                    ★
                  </button>
                </div>
                <div className="meta">
                  <p className="title">{p.title}</p>
                  <p className="sub">
                    {[p.artist, p.dateText].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {p.objectType && <span className="type">{p.objectType}</span>}
                  <div className="card-actions">
                    <button
                      className="save-btn remove"
                      onClick={() => removePiece(p.artworkId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {selected && (
        <Placard
          artwork={{ ...selected, image: selected.image ?? selected.thumb }}
          source={
            selected.sourceMuseum && selected.museumObjectId
              ? { museum: selected.sourceMuseum, objectId: selected.museumObjectId }
              : undefined
          }
          galleryId={galleryId}
          editable
          note={selected.note}
          onNoteSaved={(note) => {
            setPieces((ps) =>
              ps.map((x) =>
                x.artworkId === selected.artworkId ? { ...x, note } : x
              )
            );
            setSelected((s) => (s ? { ...s, note } : s));
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
