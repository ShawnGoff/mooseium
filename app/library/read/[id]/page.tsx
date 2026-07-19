// /library/read/[id] — public reader, keyed directly by Gutenberg id (no saved
// row, no account needed). Reading progress is kept in localStorage.

import type { Metadata } from "next";
import Link from "next/link";
import BookReader from "@/app/den/book/[id]/BookReader";
import { GUTENDEX_HEADERS } from "@/lib/gutendex";
import { safeJsonLd } from "@/lib/jsonld";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return { title: "Book not found", robots: { index: false } };
  }
  const m = await meta(id);
  if (m.title === "Reading") {
    // Gutendex lookup failed — don't emit a boilerplate indexable page.
    return { title: "Reading", robots: { index: false } };
  }
  const title = m.author ? `${m.title} by ${m.author}` : m.title;
  const description = `Read ${m.title}${
    m.author ? ` by ${m.author}` : ""
  } free online in Mooseium's Library — a public-domain classic in a calm, distraction-free reader.`;
  return {
    title,
    description,
    alternates: { canonical: `/library/read/${id}` },
    openGraph: { title: `${title} · Mooseium Library`, description, type: "book" },
    twitter: { card: "summary", title: `${title} · Mooseium Library`, description },
  };
}

async function meta(gid: string): Promise<{ title: string; author: string | null }> {
  try {
    const r = await fetch(`https://gutendex.com/books/${gid}`, {
      headers: GUTENDEX_HEADERS,
      next: { revalidate: 86400 },
    });
    if (r.ok) {
      const d = (await r.json()) as {
        title?: string;
        authors?: { name?: string }[];
      };
      return {
        title: d.title || "Reading",
        author: d.authors?.[0]?.name ?? null,
      };
    }
  } catch {
    /* Gutendex is flaky; the reader still loads content by id below */
  }
  return { title: "Reading", author: null };
}

export default async function PublicReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return (
      <main className="container">
        <p className="den-back">
          <Link href="/library">← Library</Link>
        </p>
        <p className="status">That book couldn&apos;t be found.</p>
      </main>
    );
  }

  const m = await meta(id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: m.title,
    ...(m.author ? { author: { "@type": "Person", name: m.author } } : {}),
    isAccessibleForFree: true,
    // The source edition on Project Gutenberg.
    sameAs: `https://www.gutenberg.org/ebooks/${id}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <BookReader
        id={null}
        userId={null}
        gid={id}
        title={m.title}
        author={m.author}
        initialPercent={0}
        initialNoteDocId={null}
        backHref="/library"
      />
    </>
  );
}
