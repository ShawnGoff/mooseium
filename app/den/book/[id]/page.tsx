// /den/book/[id] — read a saved book in a clean overlay-style page.

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import BookReader from "./BookReader";

export const dynamic = "force-dynamic";

export default async function BookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="container">
        <p className="status">Connect Supabase to read.</p>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="container">
        <p className="status">
          Please <Link href="/login">sign in</Link> to read.
        </p>
      </main>
    );
  }

  const { data: book } = await supabase
    .from("den_books")
    .select("id, source, external_id, title, author, progress")
    .eq("id", id)
    .single();

  if (!book) {
    return (
      <main className="container">
        <p className="status">
          That book isn&apos;t in your Den. <Link href="/den">Back</Link>.
        </p>
      </main>
    );
  }

  if (book.source !== "gutenberg") {
    return (
      <main className="container">
        <p className="den-back">
          <Link href="/den">← The Den</Link>
        </p>
        <p className="status">
          Reading isn&apos;t supported for this source yet.
        </p>
      </main>
    );
  }

  const percent =
    typeof (book.progress as { percent?: number })?.percent === "number"
      ? (book.progress as { percent: number }).percent
      : 0;

  return (
    <BookReader
      id={book.id}
      gid={book.external_id}
      title={book.title ?? "Untitled"}
      author={book.author}
      initialPercent={percent}
    />
  );
}
