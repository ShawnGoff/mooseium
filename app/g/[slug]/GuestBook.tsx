"use client";

import { useState } from "react";
import Link from "next/link";
import ReportModal from "@/app/components/ReportModal";

export type GuestEntry = {
  userId: string;
  displayName: string;
  handle?: string;
  message?: string;
  ownerReply?: string;
  createdAt: string;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export default function GuestBook({
  galleryId,
  viewerId,
  signedIn,
  isOwner,
  enabled,
  initialEntries,
}: {
  galleryId: string;
  viewerId?: string;
  signedIn: boolean;
  isOwner: boolean;
  enabled: boolean;
  initialEntries: GuestEntry[];
}) {
  const [entries, setEntries] = useState<GuestEntry[]>(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const mine = viewerId ? entries.find((e) => e.userId === viewerId) : undefined;

  const [message, setMessage] = useState(mine?.message ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reportUserId, setReportUserId] = useState<string | null>(null);

  // Hide the whole section if the owner turned it off (owner still sees a note).
  if (!enabled && !isOwner) return null;

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleryId, message }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const entry: GuestEntry = {
        userId: data.entry.user_id,
        displayName: data.entry.display_name,
        message: data.entry.message ?? undefined,
        createdAt: data.entry.created_at,
      };
      setEntries((es) => [entry, ...es.filter((e) => e.userId !== entry.userId)]);
      setOpen(false);
    } catch {
      setError("Could not sign. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMine() {
    setBusy(true);
    try {
      const res = await fetch(`/api/guestbook?galleryId=${galleryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEntries((es) => es.filter((e) => e.userId !== viewerId));
      setMessage("");
    } catch {
      setError("Could not remove your signature.");
    } finally {
      setBusy(false);
    }
  }

  async function ownerDelete(userId: string) {
    if (!confirm("Remove this signature?")) return;
    try {
      const res = await fetch(
        `/api/guestbook?galleryId=${galleryId}&userId=${userId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error();
      setEntries((es) => es.filter((e) => e.userId !== userId));
    } catch {
      setError("Could not remove that signature.");
    }
  }

  async function block(userId: string) {
    if (!confirm("Block this person from signing your galleries? Their notes will be hidden."))
      return;
    try {
      const res = await fetch("/api/guestbook/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error();
      setEntries((es) => es.filter((e) => e.userId !== userId));
    } catch {
      setError("Could not block that user.");
    }
  }

  async function reply(userId: string, text: string) {
    try {
      const res = await fetch("/api/guestbook/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ galleryId, entryUserId: userId, reply: text }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEntries((es) =>
        es.map((e) => (e.userId === userId ? { ...e, ownerReply: data.reply ?? undefined } : e))
      );
    } catch {
      setError("Could not save the reply.");
    }
  }

  return (
    <section className="guestbook">
      <h2 className="guestbook-title">Guestbook</h2>
      <p className="guestbook-sub">
        {!enabled
          ? "The guestbook is turned off (only you can see this)."
          : entries.length === 0
          ? isOwner
            ? "Your guestbook is ready — share your gallery and visitors can leave a note here."
            : "Be the first to sign."
          : `${entries.length} ${entries.length === 1 ? "visitor has" : "visitors have"} signed.`}
      </p>

      {enabled && !isOwner && (
        !signedIn ? (
          <p className="guestbook-signin">
            <Link href="/login">Sign in</Link> to sign the guestbook.
          </p>
        ) : mine && !open ? (
          <div className="guestbook-you">
            <span>You signed this guestbook.</span>
            <button className="link-btn" onClick={() => setOpen(true)}>
              Edit
            </button>
            <button className="link-btn danger" onClick={removeMine} disabled={busy}>
              Remove
            </button>
          </div>
        ) : (
          <div className="guestbook-form">
            <input
              type="text"
              maxLength={280}
              placeholder="Leave a note (optional)…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="link-btn accent" onClick={sign} disabled={busy}>
              {busy ? "Signing…" : mine ? "Update" : "Sign the guestbook"}
            </button>
            {mine && (
              <button className="link-btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
            )}
          </div>
        )
      )}

      {error && <p className="status error">{error}</p>}

      {entries.length > 0 && (
        <ul className="guestbook-list">
          {entries.map((e) => (
            <Entry
              key={e.userId}
              entry={e}
              isOwner={isOwner}
              isSelf={e.userId === viewerId}
              canReport={signedIn && !isOwner && e.userId !== viewerId}
              onDelete={() => ownerDelete(e.userId)}
              onBlock={() => block(e.userId)}
              onReply={(text) => reply(e.userId, text)}
              onReport={() => setReportUserId(e.userId)}
            />
          ))}
        </ul>
      )}

      {reportUserId && (
        <ReportModal
          targetType="guestbook"
          galleryId={galleryId}
          subjectUserId={reportUserId}
          what="signature"
          onClose={() => setReportUserId(null)}
        />
      )}
    </section>
  );
}

function Entry({
  entry,
  isOwner,
  isSelf,
  canReport,
  onDelete,
  onBlock,
  onReply,
  onReport,
}: {
  entry: GuestEntry;
  isOwner: boolean;
  isSelf: boolean;
  canReport: boolean;
  onDelete: () => void;
  onBlock: () => void;
  onReply: (text: string) => void;
  onReport: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState(entry.ownerReply ?? "");

  return (
    <li className="guestbook-entry">
      <div className="guestbook-entry-head">
        <span className="guestbook-name">
          {entry.displayName || "A visitor"}
          {entry.handle && <span className="guestbook-handle"> @{entry.handle}</span>}
        </span>
        <span className="guestbook-date">{fmtDate(entry.createdAt)}</span>
      </div>
      {entry.message && <p className="guestbook-message">{entry.message}</p>}

      {entry.ownerReply && !replying && (
        <div className="guestbook-reply">
          <span className="guestbook-reply-label">Curator</span> {entry.ownerReply}
        </div>
      )}

      {isOwner && (
        <div className="guestbook-actions">
          {replying ? (
            <div className="guestbook-form">
              <input
                type="text"
                maxLength={280}
                placeholder="Reply…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
              />
              <button
                className="link-btn accent"
                onClick={() => {
                  onReply(text);
                  setReplying(false);
                }}
              >
                Save
              </button>
              <button className="link-btn" onClick={() => setReplying(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button className="link-btn" onClick={() => setReplying(true)}>
                {entry.ownerReply ? "Edit reply" : "Reply"}
              </button>
              <button className="link-btn" onClick={onDelete}>
                Delete
              </button>
              {!isSelf && (
                <button className="link-btn danger" onClick={onBlock}>
                  Block
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!isOwner && canReport && (
        <div className="guestbook-actions">
          <button className="link-btn subtle" onClick={onReport}>
            Report
          </button>
        </div>
      )}
    </li>
  );
}
