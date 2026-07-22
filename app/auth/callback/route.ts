// GET /auth/callback — exchanges the OAuth / magic-link code for a session,
// then redirects into the app.
//
// The session cookies MUST be attached to the redirect response itself. Cookies
// written to the request's cookie store don't ride along on a manually-created
// NextResponse.redirect(), so the page we redirected to rendered signed-out —
// the header flashed "Sign in" until the browser wrote the cookie after
// hydration. Collecting them here and setting them on the response makes the
// very first render already signed-in.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type PendingCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only allow same-origin relative redirects (block open-redirects like
  // "//evil.com" or "https://evil.com").
  const requested = searchParams.get("next") ?? "/";
  const next =
    requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  if (!code) return NextResponse.redirect(`${origin}/login?error=auth`);

  const cookieStore = await cookies();
  const pending: PendingCookie[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(list) {
          pending.push(...(list as PendingCookie[]));
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=auth`);

  // First-time users have no handle yet — send them to finish setup so they end
  // up with a shareable profile and museum.
  let target = `${origin}${next}`;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && next === "/") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    if (!profile?.username) target = `${origin}/account?welcome=1`;
  }

  const response = NextResponse.redirect(target);
  for (const c of pending) {
    response.cookies.set(c.name, c.value, c.options ?? {});
  }
  return response;
}
