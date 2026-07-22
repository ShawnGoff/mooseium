// /art/[museum]/[objectId] — a permanent page for a single artwork.
//
// Indexing policy: only pieces someone has placed in a PUBLIC gallery are
// indexable. Everything else renders normally for visitors but is noindex, so
// we never flood the index with thin copies of museum metadata. Each page also
// canonical-links back to the museum's own record and adds what they can't:
// which Mooseium galleries feature the piece, plus a way to collect it.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdapter } from "@/lib/museums";
import type { NormalizedArtwork } from "@/lib/museums/types";
import { cleanProse, decodeEntities } from "@/lib/util/text";
import { galleriesContaining } from "@/lib/artwork-galleries";
import { safeJsonLd } from "@/lib/jsonld";

// Museum records barely change; cache hard and refresh weekly.
export const revalidate = 604800;

const MUSEUM_NAMES: Record<string, string> = {
  met: "The Metropolitan Museum of Art",
  artic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  rijks: "Rijksmuseum",
  harvard: "Harvard Art Museums",
  smithsonian: "Smithsonian Open Access",
  vam: "Victoria and Albert Museum",
};

async function load(
  museum: string,
  objectId: string
): Promise<{ art: NormalizedArtwork; image: string } | null> {
  const adapter = getAdapter(museum);
  if (!adapter || !objectId) return null;
  try {
    const art = await adapter.getObject(objectId);
    const image = adapter.getImageUrl(art, 1200) || art.sourceImageUrl || "";
    return { art, image };
  } catch {
    return null;
  }
}

function credit(art: NormalizedArtwork): string {
  const parts = [decodeEntities(art.artist), decodeEntities(art.dateText)].filter(Boolean);
  return parts.join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ museum: string; objectId: string }>;
}): Promise<Metadata> {
  const { museum, objectId } = await params;
  const loaded = await load(museum, objectId);
  if (!loaded) return { title: "Artwork not found", robots: { index: false } };

  const { art, image } = loaded;
  const title = decodeEntities(art.title) || "Untitled";
  const artist = decodeEntities(art.artist);
  const museumName = MUSEUM_NAMES[museum] ?? museum;
  const heading = artist ? `${title} by ${artist}` : title;

  // Only index pieces that have earned it by appearing in a public gallery.
  const inGalleries = await galleriesContaining(museum, objectId);
  const indexable = inGalleries.length > 0;

  const description =
    cleanProse(art.description)?.slice(0, 155) ||
    `${heading}${art.medium ? ` — ${decodeEntities(art.medium)}` : ""}. From ${museumName}, viewable in Mooseium.`;

  return {
    title: heading,
    description,
    alternates: { canonical: `/art/${museum}/${objectId}` },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title: `${heading} · Mooseium`,
      description,
      type: "article",
      ...(image ? { images: [{ url: image, alt: heading }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${heading} · Mooseium`,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ArtworkPage({
  params,
}: {
  params: Promise<{ museum: string; objectId: string }>;
}) {
  const { museum, objectId } = await params;
  const loaded = await load(museum, objectId);
  if (!loaded) notFound();

  const { art, image } = loaded;
  const title = decodeEntities(art.title) || "Untitled";
  const artist = decodeEntities(art.artist);
  const museumName = MUSEUM_NAMES[museum] ?? museum;
  const description = cleanProse(art.description);
  const inGalleries = await galleriesContaining(museum, objectId);

  const rows: [string, string | undefined][] = [
    ["Artist", artist],
    ["Date", decodeEntities(art.dateText)],
    ["Medium", decodeEntities(art.medium)],
    ["Culture", decodeEntities(art.culture)],
    ["Dimensions", decodeEntities(art.dimensions)],
    ["Credit", decodeEntities(art.creditLine)],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: title,
    ...(artist ? { creator: { "@type": "Person", name: artist } } : {}),
    ...(art.dateText ? { dateCreated: decodeEntities(art.dateText) } : {}),
    ...(art.medium ? { artMedium: decodeEntities(art.medium) } : {}),
    ...(art.objectType ? { artform: decodeEntities(art.objectType) } : {}),
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
    isPartOf: { "@type": "CollectionPage", name: museumName },
    ...(art.sourceUrl ? { sameAs: art.sourceUrl } : {}),
  };

  return (
    <main className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <p className="den-back">
        <Link href="/">← Explore more art</Link>
      </p>

      <article className="art-page">
        <div className="art-page-image">
          {image && (
            /* Loaded straight from the museum CDN — browsers can fetch these
               even where our server is blocked. eslint-disable-next-line @next/next/no-img-element */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={image} alt={title} />
          )}
        </div>

        <div className="art-page-info">
          <h1>{title}</h1>
          {credit(art) && <p className="art-page-credit">{credit(art)}</p>}

          {description && <p className="art-page-desc">{description}</p>}

          <dl className="placard-fields">
            {rows
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div className="placard-row" key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
          </dl>

          {inGalleries.length > 0 && (
            <section className="art-page-block">
              <h2>Featured in</h2>
              <ul className="placard-list">
                {inGalleries.map((g) => (
                  <li key={g.slug}>
                    <Link href={`/g/${g.slug}`}>{g.name}</Link>
                    {g.curator ? ` — curated by ${g.curator}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="art-page-actions">
            <Link href="/login" className="placard-save placard-signin">
              Add this to your museum
            </Link>
            {art.sourceUrl && (
              <a
                href={art.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                View at {museumName} ↗
              </a>
            )}
          </div>

          <p className="art-page-note">
            Open-access artwork courtesy of {museumName}. Mooseium is not
            affiliated with or endorsed by this institution.
          </p>
        </div>
      </article>
    </main>
  );
}
