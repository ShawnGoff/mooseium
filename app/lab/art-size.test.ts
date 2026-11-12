// The size rule shared by the layout and the renderer.

import { describe, expect, it } from "vitest";
import { MAX_H, MAX_W, MIN_H, UNSIZED, displaySize, fitImage } from "./art-size";
import { reservedSize } from "./museum/museum-layout";

const piece = (realW?: number, realH?: number) => ({ title: "", image: "x", realW, realH });

// Portrait miniature to handscroll, plus the unsized case.
const PIECES = [
  piece(),
  piece(0.1, 0.15),
  piece(0.6, 0.8),
  piece(1.6, 1.1),
  piece(4.37, 3.63), // the Night Watch
  piece(9, 0.3), // a handscroll
  piece(0.4, 6), // a hanging banner
];
const ASPECTS = [0.2, 0.5, 0.8, 1, 1.33, 2, 5, 30];

describe("displaySize", () => {
  it("hangs a piece at its stated size when that fits", () => {
    expect(displaySize(piece(1.6, 1.1))).toEqual({ w: 1.6, h: 1.1 });
  });

  it("scales an oversized piece down with its proportions intact", () => {
    const { w, h } = displaySize(piece(4.37, 3.63));
    expect(h).toBeCloseTo(MAX_H);
    expect(w / h).toBeCloseTo(4.37 / 3.63);
  });

  it("keeps a long scroll a long strip, capped at the widest allowed", () => {
    const { w, h } = displaySize(piece(9, 0.3));
    expect(w).toBeCloseTo(MAX_W);
    expect(w / h).toBeCloseTo(30);
  });

  it("lifts a miniature to the minimum height without changing its shape", () => {
    const { w, h } = displaySize(piece(0.1, 0.15));
    expect(h).toBeCloseTo(MIN_H);
    expect(w / h).toBeCloseTo(0.1 / 0.15);
  });

  it("uses the standard box when dimensions are missing or partial", () => {
    expect(displaySize(piece())).toEqual(UNSIZED);
    expect(displaySize(piece(1.2, undefined))).toEqual(UNSIZED);
    expect(displaySize(piece(undefined, 1.2))).toEqual(UNSIZED);
    expect(displaySize(piece(0, 1.2))).toEqual(UNSIZED);
  });

  it.each(PIECES)("never exceeds the maximum box (%o)", (p) => {
    const { w, h } = displaySize(p);
    expect(w).toBeLessThanOrEqual(MAX_W + 1e-9);
    expect(h).toBeLessThanOrEqual(MAX_H + 1e-9);
  });
});

describe("fitImage", () => {
  it("fills the box when the image has the box's shape", () => {
    const { w, h } = fitImage({ w: 2, h: 1 }, 2);
    expect(w).toBeCloseTo(2);
    expect(h).toBeCloseTo(1);
  });

  it("never distorts the image", () => {
    for (const a of ASPECTS) {
      const { w, h } = fitImage({ w: 2.2, h: 1.7 }, a);
      expect(w / h).toBeCloseTo(a);
    }
  });

  it("falls back to the box for a nonsense aspect", () => {
    expect(fitImage({ w: 2, h: 1 }, 0)).toEqual({ w: 2, h: 1 });
    expect(fitImage({ w: 2, h: 1 }, NaN)).toEqual({ w: 2, h: 1 });
  });
});

// The point of the shared rule: whatever image arrives, the renderer cannot
// draw a piece wider or taller than the space the layout reserved for it.
describe("renderer and layout agree", () => {
  it.each(PIECES)("drawn size stays inside the reserved space (%o)", (p) => {
    const reserved = reservedSize(p);
    for (const a of ASPECTS) {
      const drawn = fitImage(displaySize(p), a);
      expect(drawn.w).toBeLessThanOrEqual(reserved.w + 1e-9);
      expect(drawn.h).toBeLessThanOrEqual(reserved.h + 1e-9);
    }
  });
});
