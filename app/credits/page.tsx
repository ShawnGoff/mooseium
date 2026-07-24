// /credits — Credits & Thanks. Acknowledges the institutions, open-access
// programs, and open-source projects that make Mooseium possible.

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Credits & Thanks",
  description:
    "The museums, libraries, creators, and open-source projects that make Mooseium possible.",
  alternates: { canonical: "/credits" },
};

const MUSEUMS: { name: string; href: string; units?: string[] }[] = [
  {
    name: "The Metropolitan Museum of Art",
    href: "https://www.metmuseum.org/about-the-met/policies-and-documents/open-access",
  },
  {
    name: "Art Institute of Chicago",
    href: "https://www.artic.edu/open-access/open-access-images",
  },
  { name: "Cleveland Museum of Art", href: "https://www.clevelandart.org/open-access" },
  { name: "Rijksmuseum", href: "https://www.rijksmuseum.nl/en/rijksstudio" },
  {
    name: "Harvard Art Museums",
    href: "https://harvardartmuseums.org/collections/api",
  },
  {
    name: "Smithsonian Open Access",
    href: "https://www.si.edu/openaccess",
    units: [
      "Smithsonian American Art Museum",
      "Freer Gallery of Art and Arthur M. Sackler Gallery (National Museum of Asian Art)",
      "National Portrait Gallery",
      "Cooper Hewitt, Smithsonian Design Museum",
      "Hirshhorn Museum and Sculpture Garden",
      "National Museum of African Art",
      "National Museum of African American History and Culture",
      "National Museum of the American Indian",
      "Anacostia Community Museum",
    ],
  },
];

// Music attributions — attribution isn't required by Pixabay's license, but we
// like to credit the artists. Add each track here as you add it to the player.
const MUSIC: { title: string; artist: string; via: string }[] = [
  { title: "Jazz Restaurant Music", artist: "Alex Morgan", via: "Pixabay" },
  { title: "Relaxing Coffee Shop Music", artist: "Alex Morgan", via: "Pixabay" },
  { title: "Perfect Sunset Lo-Fi Music", artist: "Sonican", via: "Pixabay" },
  { title: "Hopeful City Lo-Fi Music", artist: "Sonican", via: "Pixabay" },
  { title: "Soft Chill Coffee", artist: "Mellowtape Nights", via: "Pixabay" },
  {
    title: "Moonlit Serenity: Deep Sleep Ambient",
    artist: "ChrisDjYogi",
    via: "Pixabay",
  },
  { title: "Timeless Love Acoustic Loop", artist: "Sonican", via: "Pixabay" },
  { title: "Art Gallery Museum", artist: "Franzian-Deo", via: "Pixabay" },
  { title: "Rain Sound", artist: "Boon Freak", via: "Pixabay" },
];

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function CreditsPage() {
  return (
    <main className="container credits">
      <div className="brand">
        <h1>Credits &amp; Thanks</h1>
        <span className="tag">the people and institutions behind Mooseium</span>
      </div>

      <p className="credits-intro">
        Mooseium exists because of the generosity of world-class museums,
        libraries, and creators who share their work openly. None of this would
        be possible without them, and we&apos;re grateful. This page is our
        thank-you.
      </p>

      <section className="credits-section">
        <h2>The museums</h2>
        <p>
          Every artwork you can search, save, and hang in your galleries comes
          from a museum&apos;s open-access program — collections these
          institutions have made freely available to the public. We&apos;re
          deeply thankful to:
        </p>
        <ul className="credits-list">
          {MUSEUMS.map((m) => (
            <li key={m.name}>
              <Ext href={m.href}>{m.name}</Ext>
              {m.units && (
                <span className="credits-fine">
                  {" "}
                  — including {m.units.join(", ")}.
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="credits-fine">
          Mooseium is an independent project and is not affiliated with, endorsed
          by, or sponsored by any of these institutions. Rights to individual
          works remain with the institutions and rights-holders; please consult
          each museum&apos;s open-access terms before reuse.
        </p>
      </section>

      <section className="credits-section">
        <h2>The libraries</h2>
        <p>
          The reading room is powered by public-domain books and the volunteers
          and organizations who digitize and catalog them:
        </p>
        <ul className="credits-list">
          <li>
            <Ext href="https://www.gutenberg.org/">Project Gutenberg</Ext> — tens
            of thousands of public-domain books, digitized by volunteers, that
            you can read here in full.
          </li>
          <li>
            <Ext href="https://gutendex.com/">Gutendex</Ext> — the open API that
            makes Project Gutenberg searchable.
          </li>
          <li>
            <Ext href="https://openlibrary.org/">Open Library</Ext> (a project of
            the <Ext href="https://archive.org/">Internet Archive</Ext>) —
            descriptions and metadata that enrich each book.
          </li>
        </ul>
      </section>

      <section className="credits-section">
        <h2>Music &amp; sound</h2>
        <p>
          Background music and ambient sound are sourced from{" "}
          <Ext href="https://pixabay.com/music/">Pixabay</Ext>. With thanks to the
          artists:
        </p>
        <ul className="credits-list">
          {MUSIC.map((t) => (
            <li key={t.title}>
              <em>{t.title}</em>
              {t.artist !== "—" ? ` by ${t.artist}` : ""} — via {t.via}
            </li>
          ))}
        </ul>
      </section>

      <section className="credits-section">
        <h2>Built with open source</h2>
        <p>
          Mooseium stands on a lot of shoulders. Thanks to the maintainers of{" "}
          <Ext href="https://nextjs.org/">Next.js</Ext>,{" "}
          <Ext href="https://react.dev/">React</Ext>,{" "}
          <Ext href="https://supabase.com/">Supabase</Ext>,{" "}
          <Ext href="https://threejs.org/">three.js</Ext> with{" "}
          <Ext href="https://docs.pmnd.rs/react-three-fiber">React Three Fiber</Ext>{" "}
          and <Ext href="https://github.com/pmndrs/drei">drei</Ext>, and the many
          open-source libraries in between.
        </p>
      </section>

      <p className="credits-outro">
        To every curator, archivist, volunteer, developer, and artist whose work
        we get to build on — thank you. 🫎
      </p>
    </main>
  );
}
