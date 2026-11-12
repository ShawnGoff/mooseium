// How big a piece hangs. This is the ONE place that decides it: the layout
// reserves wall space from displaySize(), and the renderer draws inside that
// same box with fitImage(). They used to carry separate rules — the layout
// reserved a width from the stated dimensions while the renderer drew height ×
// image aspect — so a piece could be drawn wider than the space kept for it and
// overlap its neighbour.
//
// Pure and dependency-free: safe for the layout maths, the renderer and tests.

export type Size = { w: number; h: number };

export const MAX_W = 5.5; // widest a picture is drawn, in metres
export const MAX_H = 2.8; // tallest — the walls are 4m
export const MIN_H = 0.35; // a miniature still has to be findable on a wall
// A piece whose museum states no usable dimensions. Most such images are
// between portrait and mild landscape; this box suits both without dominating.
export const UNSIZED: Size = { w: 2.2, h: 1.7 };

// The box a piece's picture occupies on the wall, known before its image loads.
//
// With stated dimensions it is the real size, scaled down (never up past
// MIN_H) to fit MAX_W × MAX_H with its proportions intact — so the Night Watch
// is huge, a miniature is small, and a handscroll stays a long strip.
export function displaySize(piece: { realW?: number; realH?: number }): Size {
  const { realW, realH } = piece;
  if (!(realW && realH && realW > 0 && realH > 0)) return { ...UNSIZED };
  const aspect = realW / realH;
  let h = Math.min(MAX_H, Math.max(MIN_H, realH));
  let w = h * aspect;
  if (w > MAX_W) {
    w = MAX_W;
    h = w / aspect;
  }
  return { w, h };
}

// The size to draw an image of the given aspect (width / height) so it sits
// inside `box` undistorted. The image's own shape wins over the stated
// dimensions' shape — a photograph is never stretched — but it may not grow
// past the box, because the box is what the layout kept clear for it.
export function fitImage(box: Size, aspect: number): Size {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return { ...box };
  return aspect > box.w / box.h
    ? { w: box.w, h: box.w / aspect }
    : { w: box.h * aspect, h: box.h };
}
