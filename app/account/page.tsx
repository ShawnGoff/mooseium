// /account — set your public display name.

import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import AccountForm from "./AccountForm";

// Private, per-user page — keep it out of search indexes.
export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
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
        <h1>{welcome ? "Welcome to Mooseium" : "Account"}</h1>
      </div>
      {welcome ? (
        <p className="status">
          Almost there — pick a handle and name to claim your public profile and
          3D museum. You can change these anytime.
        </p>
      ) : (
        <p className="status">Signed in as {user.email}</p>
      )}
      <AccountForm
        welcome={!!welcome}
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
