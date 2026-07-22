// /galleries — index of public galleries. The list is fetched HERE on the
// server so every gallery link is in the initial HTML (and therefore
// crawlable); GalleriesClient just renders it and stays interactive.

import type { Metadata } from "next";
import GalleriesClient from "./GalleriesClient";
import { fetchPublicGalleries } from "@/lib/public-galleries";

export const metadata: Metadata = {
  title: "Galleries",
  description:
    "Browse public art galleries curated by the Mooseium community — collections of open-access masterpieces from the world's great museums.",
  alternates: { canonical: "/galleries" },
};

// Re-render periodically so newly published galleries show up without a deploy.
export const revalidate = 600;

export default async function GalleriesPage() {
  const galleries = await fetchPublicGalleries(24);
  return <GalleriesClient initialGalleries={galleries} />;
}
