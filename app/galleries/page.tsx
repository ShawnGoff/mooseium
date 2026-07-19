// /galleries — index of public galleries. The grid itself is client-rendered
// (GalleriesClient); this server wrapper owns the page metadata.

import type { Metadata } from "next";
import GalleriesClient from "./GalleriesClient";

export const metadata: Metadata = {
  title: "Galleries",
  description:
    "Browse public art galleries curated by the Mooseium community — collections of open-access masterpieces from the world's great museums.",
  alternates: { canonical: "/galleries" },
};

export default function GalleriesPage() {
  return <GalleriesClient />;
}
