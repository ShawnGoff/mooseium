// Invariants for the museum floor plan and the hanging logic.
//
// These pin what must stay true however the layout is computed: rooms don't
// overlap, you can walk everywhere, saved slot keys don't move, and paintings
// neither touch each other nor run off their wall.

import { describe, expect, it } from "vitest";
import type { GalleryPiece } from "../gallery3d";
import {
  COLL_HALF,
  DOOR_HALF,
  GALLERY_CAP,
  buildMuseum,
  hangRoom,
  reservedSize,
  wallScale,
  type AABB,
  type GalleryBuild,
  type Museum,
  type Side,
} from "./museum-layout";

const TOL = 1e-6;
const CORNER_MARGIN = 1.1; // hangRoom's M: art stays this far off a corner

// ---- fixtures ----

function museum(wings: number[], withDefault = false): Museum {
  return {
    name: "Test Museum",
    curator: "Tester",
    handle: "tester",
    wings: wings.map((n, w) => ({
      name: withDefault && w === 0 ? "" : `Wing ${w + 1}`,
      isDefault: withDefault && w === 0,
      collections: Array.from({ length: n }, (_, c) => ({
        id: `w${w}c${c}`,
        name: `Gallery ${w + 1}.${c + 1}`,
        slug: `w${w}c${c}`,
        count: 8,
      })),
    })),
  };
}

const sized = (w: number, h: number): GalleryPiece => ({
  title: `${w}x${h}`,
  image: "x",
  realW: w,
  realH: h,
});
const unsized = (): GalleryPiece => ({ title: "no dimensions", image: "x" });

// A full museum gives galleries entered from every side the plan produces.
const FULL = buildMuseum(museum([3, 3, 3]));

// ---- geometry helpers ----

const overlapArea = (a: AABB, b: AABB) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

const touches = (a: AABB, b: AABB) =>
  a.x0 <= b.x1 + TOL && b.x0 <= a.x1 + TOL && a.z0 <= b.z1 + TOL && b.z0 <= a.z1 + TOL;

const contains = (a: AABB, x: number, z: number) =>
  x >= a.x0 - TOL && x <= a.x1 + TOL && z >= a.z0 - TOL && z <= a.z1 + TOL;

// Which wall a hung piece is on, and where along that wall its span runs.
type Hung = { side: Side; lo: number; hi: number; y: number; h: number; scale: number };
function hang(g: GalleryBuild, pieces: GalleryPiece[]): Hung[] {
  const spots = hangRoom(g.room, g.entrySide, pieces);
  const out: Hung[] = [];
  spots.forEach((s, i) => {
    if (!s) return;
    const [x, y, z] = s.position;
    const r = g.room;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.2;
    const side: Side = near(z, r.z0) && s.rotation[1] === 0
      ? "N"
      : near(z, r.z1) && s.rotation[1] === Math.PI
      ? "S"
      : near(x, r.x0)
      ? "W"
      : "E";
    const along = side === "N" || side === "S" ? x : z;
    const { w, h } = reservedSize(pieces[i], s.scale);
    out.push({ side, lo: along - w / 2, hi: along + w / 2, y, h, scale: s.scale });
  });
  return out;
}

const wallRange = (g: GalleryBuild, side: Side) =>
  side === "N" || side === "S"
    ? { lo: g.room.x0, hi: g.room.x1 }
    : { lo: g.room.z0, hi: g.room.z1 };

function overlapsOnAWall(hung: Hung[]): number {
  let worst = 0;
  for (let i = 0; i < hung.length; i++)
    for (let j = i + 1; j < hung.length; j++) {
      if (hung[i].side !== hung[j].side) continue;
      worst = Math.max(worst, Math.min(hung[i].hi, hung[j].hi) - Math.max(hung[i].lo, hung[j].lo));
    }
  return worst;
}

// How far the worst piece runs past the corner margin (<= 0 means all inside).
function cornerOverrun(g: GalleryBuild, hung: Hung[]): number {
  let worst = -Infinity;
  for (const p of hung) {
    const { lo, hi } = wallRange(g, p.side);
    worst = Math.max(worst, lo + CORNER_MARGIN - p.lo, p.hi - (hi - CORNER_MARGIN));
  }
  return worst;
}

// How far the worst entry-wall piece intrudes over the doorway (<= 0 is clear).
function doorwayIntrusion(g: GalleryBuild, hung: Hung[]): number {
  const { lo, hi } = wallRange(g, g.entrySide);
  const c = (lo + hi) / 2;
  let worst = -Infinity;
  for (const p of hung) {
    if (p.side !== g.entrySide) continue;
    worst = Math.max(worst, Math.min(p.hi, c + DOOR_HALF) - Math.max(p.lo, c - DOOR_HALF));
  }
  return worst;
}

// ---- the floor plan ----

describe("buildMuseum", () => {
  const shapes: [string, Museum, boolean][] = [
    ["empty", museum([]), false],
    ["empty, editing", museum([]), true],
    ["one wing", museum([1]), false],
    ["default wing plus two", museum([2, 3, 1], true), false],
    ["full", museum([3, 3, 3]), false],
    ["over capacity", museum([5, 4, 3, 2]), false],
  ];

  it.each(shapes)("%s: no two rooms overlap", (_n, m, editing) => {
    const { rooms } = buildMuseum(m, editing);
    for (let i = 0; i < rooms.length; i++)
      for (let j = i + 1; j < rooms.length; j++)
        expect(overlapArea(rooms[i].rect, rooms[j].rect)).toBeLessThan(TOL);
  });

  it.each(shapes)("%s: every walkable area is reachable from the atrium", (_n, m, editing) => {
    const { walk } = buildMuseum(m, editing);
    const seen = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const i = queue.pop()!;
      walk.forEach((w, j) => {
        if (!seen.has(j) && touches(walk[i], w)) {
          seen.add(j);
          queue.push(j);
        }
      });
    }
    expect(seen.size).toBe(walk.length);
  });

  it.each(shapes)("%s: every Directory destination lands on walkable floor", (_n, m, editing) => {
    const { nav, walk } = buildMuseum(m, editing);
    for (const n of nav)
      expect(walk.some((w) => contains(w, n.spawn[0], n.spawn[2]))).toBe(true);
  });

  it.each(shapes)("%s: every wall anchor sits within its own slide range", (_n, m, editing) => {
    for (const a of buildMuseum(m, editing).wallAnchors) {
      expect(a.position[a.axis]).toBeGreaterThanOrEqual(a.lo);
      expect(a.position[a.axis]).toBeLessThanOrEqual(a.hi);
    }
  });

  it("builds at most three wings and three galleries per wing", () => {
    const m = museum([5, 4, 3, 2]);
    const { galleries, nav } = buildMuseum(m);
    expect(galleries.map((g) => g.slug)).toEqual([
      "w0c0", "w0c1", "w0c2",
      "w1c0", "w1c1", "w1c2",
      "w2c0", "w2c1", "w2c2",
    ]);
    // Surplus collections in a built wing still appear in the Directory; a
    // fourth wing does not appear at all.
    expect(nav).toHaveLength(5 + 4 + 3);
  });

  it("gives every gallery a room of the standard size", () => {
    for (const g of FULL.galleries) {
      expect(g.room.x1 - g.room.x0).toBeCloseTo(COLL_HALF * 2);
      expect(g.room.z1 - g.room.z0).toBeCloseTo(COLL_HALF * 2);
    }
  });

  it("opens all three wings to an owner who is editing an empty museum", () => {
    const visiting = buildMuseum(museum([]), false);
    const editing = buildMuseum(museum([]), true);
    expect(visiting.wallAnchors).toHaveLength(8); // atrium only
    expect(editing.wallAnchors).toHaveLength(8 + 3 * 8);
  });

  // Slot keys and anchor coordinates are stored against saved placements. If
  // this snapshot changes, existing museums' hung art moves or is orphaned —
  // that needs a migration, not a snapshot update.
  it("keeps saved wall-anchor slots where they are", () => {
    expect(
      FULL.wallAnchors.map((a) => [a.slotKey, ...a.position.map((v) => +v.toFixed(3))].join(" "))
    ).toMatchSnapshot();
  });

  it("keeps the whole plan stable for a full museum", () => {
    expect(FULL).toMatchSnapshot();
  });
});

// ---- hanging ----

describe("hangRoom", () => {
  // The mix a real gallery holds: mostly modest works, some without dimensions.
  const typical = [
    sized(0.9, 1.2), sized(1.6, 1.1), unsized(), sized(0.4, 0.5),
    sized(2.0, 1.4), unsized(), sized(1.2, 0.9), sized(0.6, 0.8),
  ];

  it.each(FULL.galleries.map((g) => [g.slug, g] as const))(
    "%s: typical pieces do not overlap, leave the corners and clear the doorway",
    (_slug, g) => {
      const hung = hang(g, typical);
      expect(hung).toHaveLength(typical.length);
      expect(overlapsOnAWall(hung)).toBeLessThanOrEqual(TOL);
      expect(cornerOverrun(g, hung)).toBeLessThanOrEqual(TOL);
      expect(doorwayIntrusion(g, hung)).toBeLessThanOrEqual(TOL);
    }
  );

  it("keeps the first six off the entry wall and flanks the door with the last two", () => {
    const g = FULL.galleries[0];
    const hung = hang(g, typical);
    expect(hung.slice(0, 6).every((p) => p.side !== g.entrySide)).toBe(true);
    expect(hung.slice(6).every((p) => p.side === g.entrySide)).toBe(true);
  });

  it("never hands out more than GALLERY_CAP slots", () => {
    const g = FULL.galleries[0];
    const spots = hangRoom(g.room, g.entrySide, Array.from({ length: 14 }, () => sized(0.5, 0.5)));
    expect(spots.filter(Boolean)).toHaveLength(GALLERY_CAP);
  });

  it("hangs nothing in an empty gallery and centres a lone piece", () => {
    const g = FULL.galleries[0];
    expect(hangRoom(g.room, g.entrySide, [])).toEqual([]);
    const [only] = hang(g, [sized(1, 1)]);
    const { lo, hi } = wallRange(g, only.side);
    expect((only.lo + only.hi) / 2).toBeCloseTo((lo + hi) / 2);
  });

  it("lifts a tall piece so its bottom edge clears the floor", () => {
    const g = FULL.galleries[0];
    for (const p of hang(g, [sized(1.5, 2.8), sized(1, 0.4)]))
      expect(p.y - p.h / 2).toBeGreaterThan(0.3);
  });

  it("hangs pieces that fit at their real size", () => {
    for (const g of FULL.galleries)
      expect(hang(g, typical).every((p) => p.scale === 1)).toBe(true);
  });

  // ---- pieces too wide for their wall ----

  // Awkward collections: all wide, all unsized, all huge, and a mix.
  const awkward: [string, GalleryPiece[]][] = [
    ["four wide screens", [sized(4, 1.5), sized(4, 1.5), sized(4, 1.5), sized(4, 1.5)]],
    ["eight handscrolls", Array.from({ length: 8 }, () => sized(9, 0.3))],
    ["eight unsized", Array.from({ length: 8 }, unsized)],
    ["eight enormous canvases", Array.from({ length: 8 }, () => sized(4.4, 3.6))],
    ["wide 7th and 8th", [...typical.slice(0, 6), unsized(), sized(2.5, 1.5)]],
    ["one giant among miniatures", [sized(5, 2.5), ...Array.from({ length: 7 }, () => sized(0.2, 0.3))]],
  ];

  it.each(
    awkward.flatMap(([name, pieces]) =>
      FULL.galleries.map((g) => [`${name} in ${g.slug}`, g, pieces] as const)
    )
  )("%s: nothing overlaps, passes a corner or covers the doorway", (_n, g, pieces) => {
    const hung = hang(g, pieces);
    expect(hung).toHaveLength(pieces.length);
    expect(overlapsOnAWall(hung)).toBeLessThanOrEqual(TOL);
    expect(cornerOverrun(g, hung)).toBeLessThanOrEqual(TOL);
    expect(doorwayIntrusion(g, hung)).toBeLessThanOrEqual(TOL);
  });

  it("shrinks a wall's pieces together, so relative sizes stay honest", () => {
    const g = FULL.galleries[0];
    // Six wide works: two per wall, and any pair is too wide for a wall.
    const hung = hang(g, [sized(5, 2), sized(4, 1), sized(5, 2), sized(4, 1), sized(5, 2), sized(4, 1)]);
    const byWall = new Map<Side, Hung[]>();
    hung.forEach((p) => byWall.set(p.side, [...(byWall.get(p.side) ?? []), p]));
    for (const wall of byWall.values()) {
      expect(wall).toHaveLength(2);
      expect(wall[0].scale).toBeLessThan(1);
      expect(wall[0].scale).toBe(wall[1].scale);
    }
  });

  it("still lifts a tall piece beside the doorway off the floor", () => {
    const g = FULL.galleries[0];
    const hung = hang(g, [...typical.slice(0, 6), sized(1.2, 2.8), sized(1.2, 2.8)]);
    for (const p of hung.slice(6)) expect(p.y - p.h / 2).toBeGreaterThan(0.3);
  });
});

describe("wallScale", () => {
  it("leaves pieces that fit at real size", () => {
    expect(wallScale([sized(2, 1), sized(2, 1)], 6.8, 0.8)).toBe(1);
    expect(wallScale([], 6.8, 0.8)).toBe(1);
  });

  it("finds the scale at which an overfull wall exactly fits", () => {
    const pieces = [sized(4, 1.5), sized(4, 1.5)];
    const s = wallScale(pieces, 6.8, 0.8);
    expect(s).toBeCloseTo(0.75); // (6.8 - 0.8) / 8
    const used = pieces.reduce((t, p) => t + reservedSize(p, s).w, 0) + 0.8;
    expect(used).toBeLessThanOrEqual(6.8 + TOL);
  });

  it("does not shrink small works below their frame-and-nameplate width", () => {
    // The miniature already sits at the 1.2m minimum; only the wide piece gives.
    const pieces = [sized(5.5, 1.5), sized(0.2, 0.3)];
    const s = wallScale(pieces, 6.8, 0.8);
    expect(reservedSize(pieces[1], s).w).toBeCloseTo(1.2);
    expect(reservedSize(pieces[0], s).w).toBeCloseTo(6.8 - 0.8 - 1.2);
  });
});
