import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AuthRefresh from "./components/AuthRefresh";
import { safeJsonLd } from "@/lib/jsonld";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/server";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000";

// Site-wide structured data: the Organization behind the site and the WebSite
// itself, with a SearchAction so search engines can offer a sitelinks search
// box that deep-links into Mooseium's cross-museum art search.
const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Mooseium",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      description:
        "An independent virtual art museum and library — curate open-access masterpieces from world-renowned museums and read public-domain classics.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Mooseium",
      url: SITE_URL,
      description:
        "Curate your own art gallery from open-access museum collections.",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/?museum=all&q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141210",
};

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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The server's view of the current user, handed to AuthRefresh so the client
  // can detect (and fix) a header/body auth desync.
  let serverUid: string | null = null;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    serverUid = user?.id ?? null;
  }

  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(SITE_JSON_LD) }}
        />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <AuthRefresh serverUid={serverUid} />
        <Header />
        <div id="main-content">{children}</div>
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
