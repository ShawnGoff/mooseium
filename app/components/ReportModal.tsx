"use client";

// Small modal to flag a public gallery or a guestbook entry for review.

import { useEffect, useState } from "react";

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam or misleading" },
  { value: "harassment", label: "Hateful or harassing" },
  { value: "explicit", label: "Explicit or inappropriate" },
  { value: "impersonation", label: "Impersonation or copyright" },
  { value: "other", label: "Something else" },
];

export default function ReportModal({
  targetType,
  galleryId,
  subjectUserId,
  what,
  onClose,
}: {
  targetType: "gallery" | "guestbook";
  galleryId: string;
  subjectUserId?: string;
  what: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, galleryId, subjectUserId, reason, details }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error);
      }
      setDone(true);
    } catch {
      setError("Could not submit the report. Please try again.");
    } finally {
      setBusy(false);
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
          <h2>{done ? "Report received" : "Report this " + what}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {done ? (
          <p className="status">
            Thanks — this has been flagged for review. We look into reports and take
            action where needed.
          </p>
        ) : (
          <>
            <p className="modal-sub">
              Tell us what&apos;s wrong. Reports are private and reviewed by the team.
            </p>
            <div className="report-reasons">
              {REASONS.map((r) => (
                <label key={r.value} className="report-reason">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>
            <textarea
              className="report-details"
              maxLength={1000}
              rows={3}
              placeholder="Add any details (optional)…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <div className="account-actions">
              <button onClick={submit} disabled={busy}>
                {busy ? "Submitting…" : "Submit report"}
              </button>
              <button className="link-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
            {error && <p className="status error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
