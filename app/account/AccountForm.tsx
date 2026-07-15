"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const RESERVED = new Set(["admin", "mooseium", "api", "auth", "support", "help"]);

export default function AccountForm({
  userId,
  initialName,
  initialHandle,
  initialBio,
  initialMuseumName,
  initialCenterWing,
  welcome = false,
}: {
  userId: string;
  initialName: string;
  initialHandle: string;
  initialBio: string;
  initialMuseumName: string;
  initialCenterWing: string;
  welcome?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [handle, setHandle] = useState(initialHandle);
  const [bio, setBio] = useState(initialBio);
  const [museumName, setMuseumName] = useState(initialMuseumName);
  const [centerWing, setCenterWing] = useState(initialCenterWing);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const h = handle.trim().toLowerCase();
    if (!h) {
      setError("Pick a handle so people can find your profile and museum.");
      return;
    }
    if (!/^[a-z0-9_]{3,20}$/.test(h)) {
      setError("Handle must be 3–20 characters: lowercase letters, numbers, or _.");
      return;
    }
    if (RESERVED.has(h)) {
      setError("That handle is reserved.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: name.trim() || null,
          username: h || null,
          bio: bio.trim() || null,
          museum_name: museumName.trim() || null,
          center_wing_name: centerWing.trim() || null,
        })
        .eq("id", userId);
      if (error) {
        if (error.code === "23505") setError("That handle is already taken.");
        else if (error.code === "23514")
          setError("That handle or name isn't allowed. Try another.");
        else throw error;
        return;
      }
      if (welcome) {
        // Full navigation so the server-rendered header picks up the new handle.
        window.location.href = `/@${h}`;
        return;
      }
      setSaved(true);
    } catch {
      setError("Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form" onSubmit={save}>
      <label htmlFor="displayName">Display name</label>
      <p className="account-hint">
        The name shown on your galleries and guestbook signatures. Your email is
        never shown.
      </p>
      <input
        id="displayName"
        type="text"
        maxLength={60}
        placeholder="e.g. Shawn G."
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
      />

      <label htmlFor="handle" style={{ marginTop: 16 }}>
        Handle
      </label>
      <p className="account-hint">
        A unique @name for your public profile and museum URL. Required.
      </p>
      <div className="handle-field">
        <span>@</span>
        <input
          id="handle"
          type="text"
          maxLength={20}
          placeholder="shawng"
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value.replace(/\s/g, ""));
            setSaved(false);
          }}
        />
      </div>

      <label htmlFor="bio" style={{ marginTop: 16 }}>
        Bio
      </label>
      <p className="account-hint">
        A short line about you, shown on your public profile. Optional.
      </p>
      <textarea
        id="bio"
        maxLength={280}
        rows={3}
        placeholder="e.g. Collector of dogs in art and moody landscapes."
        value={bio}
        onChange={(e) => {
          setBio(e.target.value);
          setSaved(false);
        }}
      />

      <label htmlFor="museumName" style={{ marginTop: 16 }}>
        Museum name
      </label>
      <p className="account-hint">
        The name over the entrance of your 3D museum. Defaults to “Your Name’s
        Museum”. Optional.
      </p>
      <input
        id="museumName"
        type="text"
        maxLength={60}
        placeholder="e.g. The Mooseium"
        value={museumName}
        onChange={(e) => {
          setMuseumName(e.target.value);
          setSaved(false);
        }}
      />

      <label htmlFor="centerWing" style={{ marginTop: 16 }}>
        Default wing name
      </label>
      <p className="account-hint">
        The centre wing of your museum, holding any collections you haven’t filed
        into a wing. Defaults to “Main Gallery”. Optional.
      </p>
      <input
        id="centerWing"
        type="text"
        maxLength={60}
        placeholder="e.g. Main Gallery"
        value={centerWing}
        onChange={(e) => {
          setCenterWing(e.target.value);
          setSaved(false);
        }}
      />

      <div className="account-actions">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {saved && <span className="account-saved">Saved ✓</span>}
      </div>
      {error && <p className="status error">{error}</p>}
    </form>
  );
}
