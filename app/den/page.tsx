// /den — your private study. Folder tree holding saved books and your writing.

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import DenView, { type DenBook, type DenDoc, type DenFolder } from "./DenView";

export const dynamic = "force-dynamic";

export default async function DenPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="container">
        <h1>The Den</h1>
        <p className="status">Connect Supabase to use the Den.</p>
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
        <h1>The Den</h1>
        <p className="status">
          Please <Link href="/login">sign in</Link> to open your study.
        </p>
      </main>
    );
  }

  const [foldersRes, booksRes, docsRes] = await Promise.all([
    supabase
      .from("den_folders")
      .select("id, parent_folder_id, name, sort")
      .order("sort"),
    supabase.from("den_books").select("id, folder_id, title, author").order("created_at"),
    supabase
      .from("den_documents")
      .select("id, folder_id, title, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <main className="container">
      <div className="brand">
        <h1>The Den</h1>
        <span className="tag">your private study</span>
      </div>
      <DenView
        userId={user.id}
        initialFolders={(foldersRes.data as DenFolder[]) ?? []}
        initialBooks={(booksRes.data as DenBook[]) ?? []}
        initialDocs={(docsRes.data as DenDoc[]) ?? []}
      />
    </main>
  );
}
