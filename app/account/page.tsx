// /account — set your public display name.

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import AccountForm from "./AccountForm";

export default async function AccountPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="container">
        <h1>Account</h1>
        <p className="status">Connect Supabase to manage your account.</p>
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
        <h1>Account</h1>
        <p className="status">
          Please <Link href="/login">sign in</Link> to manage your account.
        </p>
      </main>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, bio, museum_name, center_wing_name")
    .eq("id", user.id)
    .single();

  return (
    <main className="container">
      <div className="brand">
        <h1>Account</h1>
      </div>
      <p className="status">Signed in as {user.email}</p>
      <AccountForm
        userId={user.id}
        initialName={profile?.display_name ?? ""}
        initialHandle={profile?.username ?? ""}
        initialBio={profile?.bio ?? ""}
        initialMuseumName={
          (profile as { museum_name?: string | null } | null)?.museum_name ?? ""
        }
        initialCenterWing={
          (profile as { center_wing_name?: string | null } | null)?.center_wing_name ?? ""
        }
      />
    </main>
  );
}
