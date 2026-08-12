"use client";

// Rich museum cards: each shows a representative open-access piece pulled live
// from that museum's own collection (no logos or building photos — trademark and
// copyright safe), with a monogram badge, name, and location.

import { useEffect, useState } from "react";
import Link from "next/link";

type Museum = { slug: string; displayName: string };

const MONOGRAMS: Record<string, string> = {
  met: "MET",
  artic: "AIC",
  cleveland: "CMA",
  rijks: "RIJKS",
  harvard: "HAM",
  smithsonian: "SI",
  vam: "V&A",
};

const LOCATIONS: Record<string, string> = {
  met: "New York, USA",
  artic: "Chicago, USA",
  cleveland: "Cleveland, USA",
  rijks: "Amsterdam, Netherlands",
  harvard: "Cambridge, USA",
  smithsonian: "Washington, D.C., USA",
  vam: "London, UK",
};

// A signature search per museum, just to source a strong representative image.
const SIGNATURE: Record<string, string> = {
  met: "Van Gogh cypresses",
  artic: "Seurat La Grande Jatte",
  cleveland: "Monet water lilies",
  rijks: "Rembrandt Night Watch",
  harvard: "Van Gogh self portrait",
  smithsonian: "Gilbert Stuart portrait",
  vam: "Constable landscape",
};

function monogramFor(slug: string, name: string): string {
  if (MONOGRAMS[slug]) return MONOGRAMS[slug];
  return name
    .replace(/^The\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

export default function MuseumsGrid({ museums }: { museums: Museum[] }) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    museums.forEach((m) => {
      const qs = new URLSearchParams({
        museum: m.slug,
        q: SIGNATURE[m.slug] ?? "painting",
        page: "1",
        pageSize: "8",
      });
      fetch(`/api/search?${qs}`)
        .then((r) => r.json())
        .then((d) => {
          const thumb = (d.cards ?? []).find(
            (c: { thumbnailUrl?: string }) => c.thumbnailUrl
          )?.thumbnailUrl;
          if (!cancelled && thumb) {
            setImages((prev) => ({ ...prev, [m.slug]: thumb }));
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [museums]);

  return (
    <div className="museum-card-grid">
      {museums.map((m) => (
        <div key={m.slug} className="museum-card">
          <Link href={`/museums/${m.slug}`} className="museum-card-main">
            <div
              className="museum-card-img"
              style={
                images[m.slug]
                  ? { backgroundImage: `url(${images[m.slug]})` }
                  : undefined
              }
            />
            <div className="museum-card-body">
              <span className={`museum-mono mono-${m.slug}`}>
                {monogramFor(m.slug, m.displayName)}
              </span>
              <span className="museum-card-text">
                <span className="museum-name">{m.displayName}</span>
                {LOCATIONS[m.slug] && (
                  <span className="museum-card-loc">{LOCATIONS[m.slug]}</span>
                )}
              </span>
            </div>
          </Link>
          <Link href={`/museum/${m.slug}`} className="museum-card-3d">
            Walk through in 3D →
          </Link>
        </div>
      ))}
    </div>
  );
}
