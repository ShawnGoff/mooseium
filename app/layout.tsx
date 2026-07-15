import type { Metadata } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "./components/Header";
import Footer from "./components/Footer";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mooseium — Curate your own art gallery",
    template: "%s · Mooseium",
  },
  description:
    "Search open-access masterpieces from six world-renowned museums, build your own collections, and share them as galleries.",
  applicationName: "Mooseium",
  openGraph: {
    type: "website",
    siteName: "Mooseium",
    title: "Mooseium — Curate your own art gallery",
    description:
      "Search open-access masterpieces from six world-renowned museums and build your own galleries.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mooseium — Curate your own art gallery",
    description:
      "Search open-access masterpieces from six world-renowned museums and build your own galleries.",
  },
};

// The header reflects the signed-in user, so render the shell per request
// rather than caching it statically.
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Mooseium",
              url: SITE_URL,
              description:
                "Curate your own art gallery from open-access museum collections.",
            }),
          }}
        />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Header />
        <div id="main-content">{children}</div>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
