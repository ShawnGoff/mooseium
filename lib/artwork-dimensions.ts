// Best-effort parse of a museum's free-text dimensions into meters {w, h}.
// Museums state size as Height × Width (× Depth). Returns null if unsure.
//
// Shared between the gallery-pieces API (pieces hung inside a gallery) and the
// in-museum editor (pieces hung free on a wall). It lived only in the
// gallery-pieces route, which is why free placements had no way to derive a real
// size — see realW/realH in Museum3D's savePlacement.
//
// Pure and dependency-free, so it is safe to import from client components.

const ok = (h: number, w: number): { w: number; h: number } | null =>
  h > 0.02 && w > 0.02 && h < 8 && w < 10 ? { w, h } : null;

// A museum often gives several measurements at once:
//   "Framed: 121 x 90.5 x 6.5 cm; Unframed: 110 x 80 cm"
// The frame is ours to draw, so measure the ARTWORK: prefer an unframed/image
// figure, then anything that isn't explicitly the frame, and only fall back to
// the framed one when it is all we have.
function pickSegment(t: string): string {
  const segs = t.split(";").map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return t;
  return (
    segs.find((s) => /^(unframed|image|sheet|overall|object|support)\b/.test(s)) ??
    segs.find((s) => !/^(framed|frame|mount|mat|with frame)\b/.test(s)) ??
    segs[0]
  );
}

export function parseDims(s?: string | null): { w: number; h: number } | null {
  if (!s) return null;
  const t = s.toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");
  const seg = pickSegment(t);

  // Per-number labels: "20.4 cm h x 14 cm w x 16.5 cm d".
  const lh = seg.match(/(\d+(?:\.\d+)?)\s*cm\s*h\b/);
  if (lh) {
    const lw = seg.match(/(\d+(?:\.\d+)?)\s*cm\s*w\b/);
    return ok(parseFloat(lh[1]) / 100, parseFloat(lw ? lw[1] : lh[1]) / 100);
  }

  // A run of two or three numbers ending in cm — "H x W cm" or "H x W x D cm".
  // Matching all three in ONE pass is what keeps H×W×D correct: requiring cm
  // straight after the second number made the engine backtrack and match "W x D",
  // so depth became width and width became height. Allows a label between the
  // numbers for forms like "h. 58.7 x diam. 37.4 cm".
  const N = String.raw`(\d+(?:\.\d+)?)`;
  const SEP = String.raw`\s*x\s*(?:diam\.?|dia\.?|w\.?|d\.?|width|depth)?\s*`;
  const cmRun = new RegExp(`${N}${SEP}${N}(?:${SEP}${N})?\\s*cm`);
  const m = seg.match(cmRun);
  if (m) return ok(parseFloat(m[1]) / 100, parseFloat(m[2]) / 100);

  // Same shape in inches, for museums that lead with imperial and give no cm.
  const inRun = new RegExp(`${N}${SEP}${N}(?:${SEP}${N})?\\s*(?:in\\b|inch|")`);
  const mi = seg.match(inRun);
  if (mi) return ok(parseFloat(mi[1]) * 0.0254, parseFloat(mi[2]) * 0.0254);

  return null;
}
