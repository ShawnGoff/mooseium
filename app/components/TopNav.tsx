"use client";

// Context-aware primary nav. Two spaces share one login: the Museum (art) and
// the Library (books/writing). The two spaces come first, then a divider, then
// the sub-nav for whichever space you're in. "Walk in 3D" is one unified world.

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
      {/* Space anchors, always first */}
      <Link href="/" className={`topbar-link${!inLibrary ? " active" : ""}`}>
        🏛 Museum
      </Link>
      {signedIn && (
        <Link href="/den" className={`topbar-link${inLibrary ? " active" : ""}`}>
          📖 My Library
        </Link>
      )}

      <span className="topbar-sep" aria-hidden />

      {/* Sub-nav for the current space */}
      {inLibrary ? (
        username && (
          <Link href={`/@${username}/museum`} className="topbar-link">
            Explore in 3D
          </Link>
        )
      ) : (
        <>
          <Link href="/museums" className="topbar-link">
            Museums
          </Link>
          {signedIn && (
            <Link href="/collections" className="topbar-link">
              Collections
            </Link>
          )}
          {username && (
            <Link href={`/@${username}/museum`} className="topbar-link">
              Explore in 3D
            </Link>
          )}
        </>
      )}
    </nav>
  );
}
