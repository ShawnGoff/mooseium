"use client";

// Context-aware primary nav. Two spaces share one login: the Museum (art) and
// the Library (books/writing). We only show the tools for the space you're in,
// plus a switch to the other and a "Walk in 3D" entry (one unified 3D world).

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopNav({
  signedIn,
  username,
}: {
  signedIn: boolean;
  username: string | null;
}) {
  const path = usePathname() || "/";
  const inLibrary = path.startsWith("/den");

  return (
    <nav className="topbar-nav">
      {inLibrary ? (
        <>
          <Link href="/den" className="topbar-link active">
            📖 The Library
          </Link>
          {username && (
            <Link href={`/@${username}/museum`} className="topbar-link">
              🚶 Walk in 3D
            </Link>
          )}
          <span className="topbar-sep" aria-hidden />
          <Link href="/" className="topbar-link">
            🏛 Museum
          </Link>
        </>
      ) : (
        <>
          <Link href="/" className="topbar-link">
            Explore
          </Link>
          <Link href="/museums" className="topbar-link">
            Museums
          </Link>
          {signedIn && (
            <Link href="/collections" className="topbar-link">
              Collections
            </Link>
          )}
          {signedIn && username && (
            <Link href={`/@${username}/museum`} className="topbar-link">
              🏛 My Museum
            </Link>
          )}
          {signedIn && (
            <>
              <span className="topbar-sep" aria-hidden />
              <Link href="/den" className="topbar-link">
                📖 The Library
              </Link>
            </>
          )}
        </>
      )}
    </nav>
  );
}
