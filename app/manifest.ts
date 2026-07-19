import type { MetadataRoute } from "next";

// Web app manifest — lets Mooseium be installed to a home screen and gives
// browsers/search engines the canonical app name, colors, and icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mooseium — Virtual art museum & library",
    short_name: "Mooseium",
    description:
      "Curate open-access masterpieces from world-renowned museums, walk your own 3D museum, and read public-domain classics.",
    start_url: "/",
    display: "standalone",
    background_color: "#141210",
    theme_color: "#141210",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
