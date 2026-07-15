"use client";

import { useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      console.error("magic link error:", err);
      const msg = err instanceof Error ? err.message : "";
      setError(msg || "Couldn't send the link — check the email or try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback` },
      });
      if (error) throw error;
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main className="container">
      <div className="brand">
        <h1>Mooseium</h1>
        <span className="tag">sign in to start curating</span>
      </div>

      {!configured ? (
        <div className="auth-card">
          <p className="status">
            Supabase isn&apos;t connected yet. Add your project URL and anon key to{" "}
            <code>.env.local</code> (see the README), then restart the dev server
            to enable sign-in.
          </p>
        </div>
      ) : sent ? (
        <div className="auth-card">
          <p>
            Check your email — we sent a magic link to <strong>{email}</strong>.
            Open it on this device to finish signing in.
          </p>
        </div>
      ) : (
        <div className="auth-card">
          <button className="google-btn" onClick={signInWithGoogle} type="button">
            Continue with Google
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={signInWithEmail}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Email me a magic link"}
            </button>
          </form>

          {error && <p className="status error">{error}</p>}
        </div>
      )}
    </main>
  );
}
