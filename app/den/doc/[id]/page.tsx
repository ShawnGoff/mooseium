// /den/doc/[id] — the writing desk: edit one document.

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import DocEditor from "./DocEditor";

export const dynamic = "force-dynamic";

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="container">
        <p className="status">Connect Supabase to write.</p>
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
          Please <Link href="/login">sign in</Link> to write.
        </p>
      </main>
    );
  }

  const { data: doc } = await supabase
    .from("den_documents")
    .select("id, title, body")
    .eq("id", id)
    .single();

  if (!doc) {
    return (
      <main className="container">
        <p className="status">
          That document doesn&apos;t exist. <Link href="/den">Back to the Den</Link>.
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="den-back">
        <Link href="/den">← The Den</Link>
      </p>
      <DocEditor id={doc.id} initialTitle={doc.title} initialBody={doc.body} />
    </main>
  );
}
