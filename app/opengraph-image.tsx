// Default Open Graph / Twitter share image for the site (home + any page
// without its own image). Branded card — no dynamic data.

import { ImageResponse } from "next/og";

export const alt =
  "Mooseium — curate the world's art and read the classics in a 3D museum & library";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CINZEL_WOFF =
  "https://cdn.jsdelivr.net/npm/@fontsource/cinzel@5.2.8/files/cinzel-latin-600-normal.woff";

export default async function Image() {
  let fonts:
    | { name: string; data: ArrayBuffer; weight: 600; style: "normal" }[]
    | undefined;
  try {
    const f = await fetch(CINZEL_WOFF);
    if (f.ok) {
      fonts = [
        { name: "Cinzel", data: await f.arrayBuffer(), weight: 600, style: "normal" },
      ];
    }
  } catch {
    /* default font is fine */
  }
  const titleFamily = fonts ? "Cinzel" : "Georgia, serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #1c1814, #322a22)",
          color: "#f3efe9",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontFamily: titleFamily,
            color: "#e9d9b0",
            letterSpacing: 4,
          }}
        >
          MOOSEIUM
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 46,
            marginTop: 20,
            color: "#f3efe9",
          }}
        >
          The world&apos;s art. Your museum.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 28,
            marginTop: 24,
            color: "#b7ad9d",
            maxWidth: 900,
            lineHeight: 1.4,
          }}
        >
          Curate open-access masterpieces from world-renowned museums, and read
          the classics — in a walkable 3D museum &amp; library.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 26,
            marginTop: 44,
            color: "#d8bd85",
            letterSpacing: 1,
          }}
        >
          🏛 Museum · 📖 Library
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  );
}
