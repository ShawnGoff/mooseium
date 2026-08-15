// Best-effort parse of a museum's free-text dimensions into meters {w, h}.
// Convention across these museums is Height × Width. Returns null if unsure.
//
// Shared between the gallery-pieces API (which sizes pieces hung inside a
// gallery) and the in-museum editor (which sizes pieces hung free on a wall).
// It lived only in the gallery-pieces route, which is why free placements had no
// way to derive a real size and every one of them rendered at the fallback
// height — see the realW/realH handling in Museum3D's savePlacement.
//
// Pure and dependency-free, so it is safe to import from client components.
export function parseDims(s?: string | null): { w: number; h: number } | null {
  if (!s) return null;
  const t = s.toLowerCase();
  const ok = (h: number, w: number) =>
    h > 0.02 && w > 0.02 && h < 8 && w < 10 ? { w, h } : null;

  // "A × B cm" (optionally preceded by an inches figure we ignore).
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)\s*cm/);
  if (m) return ok(parseFloat(m[1]) / 100, parseFloat(m[2]) / 100);

  // "height A cm ... width B cm"
  const hm = t.match(/(?:height|h)\D{0,4}(\d+(?:\.\d+)?)\s*cm/);
  const wm = t.match(/(?:width|w)\D{0,4}(\d+(?:\.\d+)?)\s*cm/);
  if (hm && wm) return ok(parseFloat(hm[1]) / 100, parseFloat(wm[1]) / 100);

  // Inches fallback: "A × B in"
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:×|x|by)\s*(\d+(?:\.\d+)?)\s*(?:in\b|inch)/);
  if (m) return ok(parseFloat(m[1]) * 0.0254, parseFloat(m[2]) * 0.0254);

  return null;
}
