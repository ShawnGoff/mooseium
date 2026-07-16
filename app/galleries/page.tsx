"use client";

// A full index of public galleries to explore, linked from the home page.

import { useEffect, useState } from "react";
import Link from "next/link";

type PublicGallery = {
  slug: string;
  name: string;
  cover?: string;
  count: number;
  curator: string;
  handle?: string;
};

export default function GalleriesPage() {
  const [galleries, setGalleries] = useState<PublicGallery[] | null>(null);

  useEffect(() => {
    fetch("/api/public-galleries")
      .then((r) => r.json())
      .then((d) => setGalleries(d.galleries ?? []))
      .catch(() => setGalleries([]));
  }, []);

  return (
    <main className="container">
      <div className="brand">
        <h1>Galleries to explore</h1>
        <span className="tag">public galleries curated by the community</span>
      </div>

      {galleries === null ? (
        <p className="status">Loading galleries…</p>
      ) : galleries.length === 0 ? (
        <p className="status">No public galleries yet.</p>
      ) : (
        <div className="pubgal-grid">
          {galleries.map((g) => (
            <Link key={g.slug} href={`/g/${g.slug}`} className="pubgal-card">
              <div
                className="pubgal-img"
                style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined}
              />
              <div className="pubgal-meta">
                <span className="pubgal-name">{g.name}</span>
                <span className="pubgal-curator">
                  {g.curator}
                  {g.handle ? ` · @${g.handle}` : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
