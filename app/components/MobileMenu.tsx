"use client";

// Phone-width navigation. The desktop nav/auth links are hidden by CSS at
// narrow widths; this hamburger exposes them in a dropdown panel.

import { useEffect, useState } from "react";
import Link from "next/link";

export default function MobileMenu({
  signedIn,
  displayName,
  username,
}: {
  signedIn: boolean;
  displayName: string | null;
  username: string | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="mobile-menu">
      <button
        className="mobile-menu-btn"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <>
          <div className="mobile-menu-scrim" onClick={() => setOpen(false)} />
          <nav className="mobile-menu-panel" onClick={() => setOpen(false)}>
            <Link href="/">🏛 My Museum</Link>
            {signedIn && <Link href="/den">📖 My Library</Link>}
            <Link href="/museums">Museums</Link>
            {signedIn && <Link href="/collections">Collections</Link>}
            {signedIn && username && (
              <Link href={`/@${username}/museum`}>Explore in 3D</Link>
            )}
            {signedIn && username && (
              <Link href={`/@${username}`}>My Profile</Link>
            )}
            {signedIn ? (
              <>
                <Link href="/account">{displayName || "Account"}</Link>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="mobile-menu-signout">
                    Sign out
                  </button>
                </form>
              </>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
