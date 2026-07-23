// Server component: shows the signed-in user + sign out, or a sign-in link.

import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";
import MobileMenu from "./MobileMenu";
import TopNav from "./TopNav";

export default async function Header() {
  let signedIn = false;
  let displayName: string | null = null;
  let username: string | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      signedIn = true;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, username")
        .eq("id", user.id)
        .single();
      displayName = profile?.display_name ?? null;
      username = profile?.username ?? null;
    }
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link href="/" className="topbar-brand">
          Mooseium
        </Link>
        <TopNav signedIn={signedIn} username={username} />
      </div>
      <nav className="topbar-auth">
        {signedIn ? (
          <>
            {username && (
              <Link href={`/@${username}`} className="topbar-link">
                My Profile
              </Link>
            )}
            <Link href="/account" className="who">
              {displayName || "Set your name"}
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="link-btn">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <Link href="/login" className="link-btn topbar-signin" data-tour="signin">
            Sign up / Sign in
          </Link>
        )}
      </nav>

      {!signedIn && (
        <Link href="/login" className="mobile-signin" data-tour="signin">
          Sign up / Sign in
        </Link>
      )}
      <MobileMenu signedIn={signedIn} displayName={displayName} username={username} />
    </header>
  );
}
