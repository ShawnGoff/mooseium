"use client";

// Last-resort error boundary. This catches what app/error.tsx cannot: a throw
// in the root layout itself, or in the error boundary's own render. Next
// replaces the whole document when this fires, so it has to supply its own
// <html> and <body> — the root layout is gone by this point, which also means
// no Header, no Footer, and no fonts.
//
// globals.css is imported so the page still looks like Mooseium rather than
// unstyled browser defaults, but the markup deliberately leans on inline styles
// for the essentials: if the stylesheet is what failed to load, this page still
// has to be readable.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          background: "#14110e",
          color: "#f2ece3",
          fontFamily:
            "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.75rem", margin: "0 0 0.75rem" }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.8, lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            Mooseium hit an unexpected error and couldn&rsquo;t finish loading
            the page. Reloading usually clears it.
          </p>
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                font: "inherit",
                padding: "0.6rem 1.2rem",
                borderRadius: "999px",
                border: "1px solid rgba(242,236,227,0.3)",
                background: "transparent",
                color: "inherit",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* A plain <a>, not next/link: the router may be the thing that
                broke, and a full document load is the reliable escape. */}
            <a
              href="/"
              style={{
                font: "inherit",
                padding: "0.6rem 1.2rem",
                borderRadius: "999px",
                border: "1px solid transparent",
                color: "inherit",
                textDecoration: "underline",
              }}
            >
              Back to Explore
            </a>
          </div>
          {error.digest && (
            <p style={{ marginTop: "2rem", fontSize: "0.8rem", opacity: 0.5 }}>
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
