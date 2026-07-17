"use client";

// Public discovery + reading, reusing the Den's Discover component in
// signed-out mode (userId = null): saving prompts sign-in, reading opens the
// public reader at /library/read/[gutenbergId].

import Link from "next/link";
import DenDiscover from "../den/DenDiscover";

const NONE = new Set<string>();

export default function PublicLibrary() {
  return (
    <main className="container">
      <div className="brand brand-row">
        <div>
          <h1>Library</h1>
          <span className="tag">read free public-domain books</span>
        </div>
        <Link href="/login" className="walk-3d-btn">
          Sign in to save
        </Link>
      </div>
      <div className="den-root">
        <DenDiscover userId={null} savedIds={NONE} onSaved={() => {}} />
      </div>
    </main>
  );
}
