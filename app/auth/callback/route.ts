// GET /auth/callback — exchanges the OAuth / magic-link code for a session,
// then redirects into the app.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only allow same-origin relative redirects (block open-redirects like
  // "//evil.com" or "https://evil.com").
  const requested = searchParams.get("next") ?? "/";
  const next =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-time users have no handle yet — send them to finish setup so they
      // end up with a shareable profile and museum.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user && next === "/") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();
        if (!profile?.username) {
          return NextResponse.redirect(`${origin}/account?welcome=1`);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
