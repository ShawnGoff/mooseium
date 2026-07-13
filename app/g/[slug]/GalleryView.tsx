"use client";

import { useState } from "react";
import Placard, { type PlacardArtwork } from "@/app/components/Placard";
import ReportModal from "@/app/components/ReportModal";
import SaveModal, { type SaveCard } from "@/app/components/SaveModal";
import GuestBook, { type GuestEntry } from "./GuestBook";

export type GalleryPiece = PlacardArtwork & {
  artworkId: string;
  museumObjectId?: string;
  note?: string;
  isFeature?: boolean;
};

export default function GalleryView({
  galleryId,
  name,
  curator,
  curatorHandle,
  editable,
  pieces,
  guestbook,
  guestbookEnabled,
  viewerId,
  signedIn,
  canSaveGallery,
  savedByViewer,
}: {
  galleryId: string;
  name: string;
  curator?: string;
  curatorHandle?: string;
  editable: boolean;
  pieces: GalleryPiece[];
  guestbook: GuestEntry[];
  guestbookEnabled: boolean;
  viewerId?: string;
  signedIn: boolean;
  canSaveGallery: boolean;
  savedByViewer: boolean;
}) {
  const [selected, setSelected] = useState<GalleryPiece | null>(null);
  const [saveCard, setSaveCard] = useState<SaveCard | null>(null);
  const [notes, setNotes] = useState<Record<string, string | undefined>>({});
  const [saved, setSaved] = useState(savedByViewer);
  const [savingGallery, setSavingGallery] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const noteFor = (p: GalleryPiece) =>
    p.artworkId in notes ? notes[p.artworkId] : p.note;

  async function toggleSaveGallery() {
    setSavingGallery(true);
    const next = !saved;
    try {
      const res = next
        ? await fetch("/api/saved-galleries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ galleryId }),
          })
        : await fetch(`/api/saved-galleries?galleryId=${galleryId}`, {
            method: "DELETE",
          });
      if (res.ok) setSaved(next);
    } finally {
      setSavingGallery(false);
    }
  }

  return (
    <div className="gallery-wall">
      <header className="gallery-header">
        <h1>{name}</h1>
        {curator && (
          <p className="gallery-curator">
            curated by{" "}
            {curatorHandle ? (
              <a href={`/@${curatorHandle}`}>{curator}</a>
            ) : (
              curator
            )}
            {curatorHandle ? (
              <>
                {" · "}
                <a href={`/@${curatorHandle}`}>@{curatorHandle}</a>
              </>
            ) : (
              ""
            )}
          </p>
        )}
        {canSaveGallery && (
          <button
            className="save-gallery-btn"
            onClick={toggleSaveGallery}
            disabled={savingGallery}
          >
            {saved ? "✓ Saved to your galleries" : "＋ Save this gallery"}
          </button>
        )}
        {signedIn && !editable && (
          <button className="report-link" onClick={() => setReportOpen(true)}>
            Report
          </button>
        )}
      </header>

      {pieces.length === 0 ? (
        <p className="status">This gallery is empty.</p>
      ) : (
        <div className="wall">
          {pieces.map((p) => (
            <figure
              key={p.artworkId}
              className={`framed${p.isFeature ? " feature" : ""}`}
              onClick={() => setSelected(p)}
              role="button"
              tabIndex={0}
              aria-label={`View details for ${p.title}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(p);
                }
              }}
            >
              <div className="frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt={p.title} loading="lazy" />}
              </div>
              <figcaption className="plaque">
                <span className="plaque-title">{p.title}</span>
                {p.artist && <span className="plaque-artist">{p.artist}</span>}
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <GuestBook
        galleryId={galleryId}
        viewerId={viewerId}
        signedIn={signedIn}
        isOwner={editable}
        enabled={guestbookEnabled}
        initialEntries={guestbook}
      />

      {selected && (
        <Placard
          artwork={selected}
          source={
            selected.sourceMuseum && selected.museumObjectId
              ? { museum: selected.sourceMuseum, objectId: selected.museumObjectId }
              : undefined
          }
          galleryId={galleryId}
          editable={editable}
          note={noteFor(selected)}
          onNoteSaved={(note) =>
            setNotes((n) => ({ ...n, [selected.artworkId]: note }))
          }
          onSave={
            signedIn && !editable && selected.sourceMuseum && selected.museumObjectId
              ? () => {
                  setSaveCard({
                    sourceMuseum: selected.sourceMuseum!,
                    museumObjectId: selected.museumObjectId!,
                    title: selected.title,
                  });
                  setSelected(null);
                }
              : undefined
          }
          onClose={() => setSelected(null)}
        />
      )}

      {saveCard && <SaveModal card={saveCard} onClose={() => setSaveCard(null)} />}

      {reportOpen && (
        <ReportModal
          targetType="gallery"
          galleryId={galleryId}
          what="gallery"
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
