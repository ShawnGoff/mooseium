"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ShareButtons from "./ShareButtons";

export type PlacardArtwork = {
  artworkId?: string;
  title: string;
  artist?: string;
  dateText?: string;
  medium?: string;
  culture?: string;
  dimensions?: string;
  objectType?: string;
  description?: string;
  creditLine?: string;
  license?: string;
  details?: { label: string; value: string }[];
  provenance?: string;
  funFact?: string;
  artistBio?: string;
  additionalImages?: string[];
  exhibitions?: string[];
  onView?: string;
  tags?: string[];
  sourceMuseum?: string;
  sourceUrl?: string;
  image?: string;
  imageFull?: string;
};

const MUSEUM_NAMES: Record<string, string> = {
  met: "The Metropolitan Museum of Art",
  artic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  rijks: "Rijksmuseum",
  harvard: "Harvard Art Museums",
  smithsonian: "Smithsonian Open Access",
  vam: "Victoria and Albert Museum",
};

type Tab = "overview" | "about" | "provenance" | "note" | "share";

export default function Placard({
  artwork,
  source,
  galleryId,
  editable,
  note,
  onNoteSaved,
  onSave,
  signedOut,
  onClose,
}: {
  artwork: PlacardArtwork;
  source?: { museum: string; objectId: string };
  galleryId?: string;
  editable?: boolean;
  note?: string;
  onNoteSaved?: (note: string | undefined) => void;
  onSave?: () => void;
  /** Signed-out viewer: show a sign-up prompt where Save would be. */
  signedOut?: boolean;
  onClose: () => void;
}) {
  const [full, setFull] = useState<PlacardArtwork>(artwork);
  const [tab, setTab] = useState<Tab>("overview");
  const [chosenImage, setChosenImage] = useState<string | undefined>(undefined);
  const [zoomed, setZoomed] = useState(false);

  // Escape closes the zoom lightbox first, then the placard itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setZoomed((z) => {
        if (z) return false;
        onClose();
        return z;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch the complete record so every placard is equally detailed.
  useEffect(() => {
    let cancelled = false;
    if (!source) return;
    const qs = new URLSearchParams({
      museum: source.museum,
      objectId: source.objectId,
    });
    fetch(`/api/artwork?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.artwork) {
          setFull((prev) => ({ ...prev, ...d.artwork, image: d.artwork.image || prev.image }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source]);

  const museum = full.sourceMuseum
    ? MUSEUM_NAMES[full.sourceMuseum] ?? full.sourceMuseum
    : undefined;

  // Acquisition/institutional details belong under Provenance; the rest describe
  // the artwork itself and go under Overview.
  const PROVENANCE_LABELS = new Set(["Department", "Accession", "Object number"]);
  const detail = full.details ?? [];
  const overviewDetails = detail.filter((d) => !PROVENANCE_LABELS.has(d.label));
  const provenanceDetails = detail.filter((d) => PROVENANCE_LABELS.has(d.label));

  const overviewRows: [string, string | undefined][] = [
    ["Artist", full.artist],
    ["Date", full.dateText],
    ["Medium", full.medium],
    ["Culture", full.culture],
    ["Type", full.objectType],
    ["Dimensions", full.dimensions],
    ...overviewDetails.map((d) => [d.label, d.value] as [string, string | undefined]),
    ["On view", full.onView],
  ];

  const images = Array.from(
    new Set([full.image, ...(full.additionalImages ?? [])].filter(Boolean) as string[])
  );
  const mainImage = chosenImage ?? full.image;
  // Zoom uses full resolution when available (the display image is ~800px).
  const zoomImage = chosenImage ?? full.imageFull ?? full.image;
  // Route museum images through our proxy: it sends the User-Agent/Referer that
  // some CDNs (Harvard's IIIF) require and bounds oversized IIIF originals that
  // mobile Safari refuses to decode. Falls back to the direct URL on error.
  const proxied = (u?: string) =>
    u ? `/api/img?url=${encodeURIComponent(u)}` : undefined;
  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>, direct?: string) => {
    const img = e.currentTarget;
    // Fall back to the museum's direct URL whenever a PROXY url fails — keyed on
    // the current src, not a one-shot flag, so it still works after the src
    // changes (e.g. the higher-res image arrives once full details load).
    if (direct && img.src.includes("/api/img")) {
      img.src = direct;
    }
  };
  const hasAbout = Boolean(full.description || full.funFact || full.artistBio);
  const provenanceRows: [string, string | undefined][] = [
    ["Credit", full.creditLine],
    ...provenanceDetails.map((d) => [d.label, d.value] as [string, string | undefined]),
    ["Rights", full.license],
  ];
  const hasProvenance = provenanceRows.some(([, v]) => v);

  // Sharing needs a public URL, so it's only offered when we know the source
  // museum + object id. Pinterest/Facebook need an ABSOLUTE image, so we hand
  // over the museum's direct CDN url (never the /api/img proxy path).
  const canShare = Boolean(source);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://mooseium.com";
  const shareUrl = source
    ? `${origin}/art/${source.museum}/${encodeURIComponent(source.objectId)}`
    : undefined;
  const shareTitle =
    (full.artist ? `${full.title} by ${full.artist}` : full.title) + " · Mooseium";

  function Rows({ rows }: { rows: [string, string | undefined][] }) {
    return (
      <dl className="placard-fields">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div className="placard-row" key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="placard"
        role="dialog"
        aria-modal="true"
        aria-label={full.title || "Artwork details"}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close placard-close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="placard-body">
          <div className="placard-image">
            <button
              className="placard-main-img"
              onClick={() => mainImage && setZoomed(true)}
              aria-label="Zoom image"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {mainImage && (
                <img
                  src={proxied(mainImage)}
                  alt={full.title}
                  onError={(e) => onImgError(e, mainImage)}
                />
              )}
            </button>
            {images.length > 1 && (
              <div className="placard-thumbs">
                {images.map((u) => (
                  <button
                    key={u}
                    className={u === mainImage ? "on" : ""}
                    onClick={() => setChosenImage(u)}
                    aria-label="View this image"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proxied(u)} alt="" onError={(e) => onImgError(e, u)} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="placard-info">
            <h2 className="placard-title">{full.title}</h2>

            <nav className="placard-tabs">
              <button className={tab === "overview" ? "on" : ""} onClick={() => setTab("overview")}>
                Overview
              </button>
              <button className={tab === "about" ? "on" : ""} onClick={() => setTab("about")}>
                About
              </button>
              <button
                className={tab === "provenance" ? "on" : ""}
                onClick={() => setTab("provenance")}
              >
                Provenance
              </button>
              <button className={tab === "note" ? "on" : ""} onClick={() => setTab("note")}>
                Curator&rsquo;s Note
              </button>
              {canShare && (
                <button className={tab === "share" ? "on" : ""} onClick={() => setTab("share")}>
                  Share
                </button>
              )}
            </nav>

            <div className="placard-content">
              {tab === "overview" && <Rows rows={overviewRows} />}

              {tab === "about" &&
                (hasAbout ? (
                  <div>
                    {full.description && <p className="placard-desc">{full.description}</p>}
                    {full.funFact && (
                      <div className="placard-block">
                        <div className="placard-block-label">Did you know?</div>
                        <p className="placard-desc">{full.funFact}</p>
                      </div>
                    )}
                    {full.artistBio && (
                      <div className="placard-block">
                        <div className="placard-block-label">About the artist</div>
                        <p className="placard-desc">{full.artistBio}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="placard-empty">No description provided by the museum.</p>
                ))}

              {tab === "provenance" &&
                (hasProvenance || full.provenance || (full.exhibitions?.length ?? 0) > 0 ? (
                  <div>
                    {full.provenance && (
                      <div className="placard-block">
                        <div className="placard-block-label">Ownership history</div>
                        <p className="placard-desc">{full.provenance}</p>
                      </div>
                    )}
                    {hasProvenance && <Rows rows={provenanceRows} />}
                    {full.exhibitions && full.exhibitions.length > 0 && (
                      <div className="placard-block">
                        <div className="placard-block-label">Exhibition history</div>
                        <ul className="placard-list">
                          {full.exhibitions.slice(0, 10).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="placard-empty">No provenance details available.</p>
                ))}

              {tab === "note" &&
                (galleryId && full.artworkId ? (
                  <NoteSection
                    galleryId={galleryId}
                    artworkId={full.artworkId}
                    initialNote={note}
                    editable={Boolean(editable)}
                    onSaved={onNoteSaved}
                  />
                ) : (
                  <p className="placard-empty">
                    Save this piece to a collection to add your own note.
                  </p>
                ))}

              {tab === "share" && shareUrl && (
                <div className="placard-share">
                  <p className="placard-share-lead">
                    Share this piece — links open the artwork&rsquo;s own page.
                  </p>
                  <ShareButtons
                    url={shareUrl}
                    title={shareTitle}
                    image={full.imageFull || full.image}
                  />
                </div>
              )}
            </div>

            <div className="placard-footer">
              {source && (
                <Link
                  href={`/art/${source.museum}/${encodeURIComponent(source.objectId)}`}
                  className="placard-fullpage"
                >
                  Open full page ↗
                </Link>
              )}
              {(museum || full.sourceUrl) && (
                <p className="placard-source">
                  {museum}
                  {full.sourceUrl && (
                    <>
                      {" · "}
                      <a href={full.sourceUrl} target="_blank" rel="noopener noreferrer">
                        View at museum ↗
                      </a>
                    </>
                  )}
                </p>
              )}
              {onSave && (
                <button className="placard-save" onClick={onSave}>
                  ＋ Save
                </button>
              )}
              {!onSave && signedOut && (
                <Link className="placard-save placard-signin" href="/login">
                  Sign up / Sign in to save
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {zoomed && zoomImage && (
        <div
          className="lightbox-overlay"
          onClick={(e) => {
            e.stopPropagation();
            setZoomed(false);
          }}
        >
          <button className="modal-close lightbox-close" aria-label="Close">
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proxied(zoomImage)}
            alt={full.title}
            onError={(e) => onImgError(e, zoomImage)}
          />
        </div>
      )}
    </div>
  );
}

function NoteSection({
  galleryId,
  artworkId,
  initialNote,
  editable,
  onSaved,
}: {
  galleryId: string;
  artworkId: string;
  initialNote?: string;
  editable: boolean;
  onSaved?: (note: string | undefined) => void;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${galleryId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkId, note }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      onSaved?.(data.note ?? undefined);
      setEditing(false);
    } catch {
      /* keep editing open */
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div>
        <textarea
          className="note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Share a story or memory about this piece…"
          autoFocus
          rows={5}
        />
        <div className="note-actions">
          <button className="link-btn accent" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save note"}
          </button>
          <button className="link-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {note ? (
        <>
          <blockquote className="curator-note">{note}</blockquote>
          {editable && (
            <button className="link-btn" onClick={() => setEditing(true)}>
              Edit note
            </button>
          )}
        </>
      ) : editable ? (
        <button className="link-btn" onClick={() => setEditing(true)}>
          Add a note
        </button>
      ) : (
        <p className="note-empty">The curator hasn’t left a note on this piece.</p>
      )}
    </div>
  );
}
