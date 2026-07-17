// /library/read/[id] — public reader, keyed directly by Gutenberg id (no saved
// row, no account needed). Reading progress is kept in localStorage.

import Link from "next/link";
import BookReader from "@/app/den/book/[id]/BookReader";

export const dynamic = "force-dynamic";

async function meta(gid: string): Promise<{ title: string; author: string | null }> {
  try {
    const r = await fetch(`https://gutendex.com/books/${gid}`, {
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

  return (
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
  );
}
