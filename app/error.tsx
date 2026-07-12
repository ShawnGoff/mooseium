"use client";

// Root error boundary — shown if a page throws while rendering.

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for debugging (a monitoring service can hook in later).
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
