// /library — the PUBLIC face of the Library. Anyone (signed in or not) can
// search, browse, and read public-domain books here. Signed-in users get sent
// to /den, their full personal study (saved shelf, folders, writing).

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import PublicLibrary from "./PublicLibrary";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Library",
  description:
    "Read and discover public-domain books free — search by title or author, browse by subject, and read classics in a calm, distraction-free reader.",
  alternates: { canonical: "/library" },
};

export default async function LibraryPage() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/den");
  }
  return <PublicLibrary />;
}
