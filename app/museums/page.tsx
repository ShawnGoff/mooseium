// /museums — index of every searchable museum, linking to each discovery feed.

import { listMuseums } from "@/lib/museums";
import MuseumsGrid from "./MuseumsGrid";

export const metadata = {
  title: "Museums",
  description:
    "Explore open-access collections from The Met, Art Institute of Chicago, Cleveland, the Rijksmuseum, Harvard, and the Smithsonian on Mooseium.",
  alternates: { canonical: "/museums" },
};

export default function MuseumsIndexPage() {
  const museums = listMuseums().map((m) => ({
    slug: m.slug,
    displayName: m.displayName,
  }));
  return (
    <main className="container">
      <div className="brand">
        <h1>Museums</h1>
        <span className="tag">{museums.length} collections</span>
      </div>
      <p className="status">
        Every piece in Mooseium is open-access art drawn from these institutions.
        Pick one to explore it by category.
      </p>
      <MuseumsGrid museums={museums} />

      <section className="how-search" id="how-search-works">
        <h2>How search works</h2>
        <p>
          Mooseium searches live across each museum&apos;s public collection API.
          Search results are based on the titles, descriptions, and metadata
          maintained by each museum. Because every institution catalogs its
          collection differently, you may occasionally discover works in
          unexpected places or find broader keyword matches. We preserve each
          museum&apos;s original data rather than applying a single
          classification system.
        </p>
      </section>
    </main>
  );
}
