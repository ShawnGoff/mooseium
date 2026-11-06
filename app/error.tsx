"use client";

// Root error boundary — shown if a page throws while rendering.

import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry, not just the console. Sentry's Next.js SDK does NOT
    // capture errors caught by an App Router error boundary — the boundary
    // handles them, so nothing reaches the global handler and the error never
    // leaves the browser. This boundary logged to the console for months while
    // Sentry was installed and configured, which is why the 3D museum crashes
    // had to be diagnosed from pasted console output instead of from Sentry.
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <main className="container">
      <div className="state-page">
        <h1>Something went wrong</h1>
        <p className="status">
          We hit an unexpected error. You can try again, or head back to Explore.
        </p>
        <div className="state-actions">
          <button className="loadmore" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="text-link">
            Back to Explore
          </Link>
        </div>
      </div>
    </main>
  );
}
