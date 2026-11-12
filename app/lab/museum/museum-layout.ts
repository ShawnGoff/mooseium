// The museum's floor plan and hanging logic, as pure functions: no React, no
// three.js, nothing that needs a browser. Museum3D renders what these return.
// Kept free of rendering imports so the layout can be tested on its own.

import { EYE_Y, ART_Y } from "../constants";
import { displaySize } from "../art-size";
import type { GalleryPiece } from "../gallery3d";

export type Collection = {
  id: string;
  name: string;
  slug: string;
  count: number;
  // Source-museum showcases carry their pieces inline (no /api/gallery-pieces).
  pieces?: GalleryPiece[];
};
export type Wing = { name: string; collections: Collection[]; isDefault?: boolean };
export type Museum = { name: string; curator: string; handle: string; wings: Wing[] };

// ---- dimensions (metres) ----
export const A = 7; // atrium half-size
export const H = 4; // wall height
export const DOORH = 2.6; // doorway height
export const CORR_HALF = 1.8; // corridor half-width
export const DOOR_HALF = 1.5; // doorway half-width
export const WING_HALF = 5; // wing room half-size
// Max pieces a gallery displays: 2 on each of the 3 solid walls, plus 2 flanking
// the entry doorway.
//
// It was 11, which put 3 pieces on a wall and crowded every gallery. 8 keeps
// the rooms uncrowded; it is a choice about how a gallery should look, not what
// keeps art on the wall — hangRoom now shrinks a wall's pieces to fit (see
// wallScale), so nothing overflows whatever the count or the widths.
export const GALLERY_CAP = 8;
export const COLL_HALF = 4.5; // gallery room half-size
export const ATR_WING_CORR = 10; // atrium→wing corridor length (spaces the wings out)
export const WING_COLL_CORR = 3; // wing→gallery corridor length
export const VEST_HALF = 6; // entrance vestibule / Den half-width
export const VEST_LEN = 14; // entrance vestibule / Den depth
export const ENTR_HALF = 2; // entrance doorway half-width
export const SIGN_MARGIN = 0.4; // breathing room a sign leaves at each end of its band
export const EPS = 0.03; // wall inset so shared walls don't z-fight
export const INSET = 0.4; // walkable inset from walls
export const BRIDGE = 0.75; // half-depth of a doorway's walkable bridge

export type Side = "N" | "S" | "E" | "W"; // N=-z, S=+z, E=+x, W=-x
export type AABB = { x0: number; x1: number; z0: number; z1: number };
export type Room = { rect: AABB; gaps: { side: Side; lo: number; hi: number }[] };
// maxW is the width of the surface the sign is actually painted on. That is NOT
// the room's wall: a sign sits over a doorway, and the corridor beyond protrudes
// as a raised band roughly the corridor's own width. A long collection name is
// wider than that band and overhangs it on both sides, which is what made
// "Henri de Toulouse-Lautrec" look like it was falling off the wall.
export type LabelSpec = {
  text: string;
  pos: [number, number, number];
  rot: [number, number, number];
  size: number;
  maxW: number;
};
// A gallery room: its slug, the room rectangle, which wall is the doorway
// (entrySide) and which is the far/feature wall, plus where the single preview
// piece hangs when the full collection isn't loaded.
export type GalleryBuild = {
  slug: string;
  name: string;
  room: AABB;
  entrySide: Side;
  previewPos: [number, number, number];
  previewRot: [number, number, number];
  // Source-museum showcases pass pieces inline instead of fetching by slug.
  pieces?: GalleryPiece[];
};
export type Nav = { wing: string; name: string; spawn: [number, number, number]; yaw: number };
export type Hint = { pos: [number, number, number]; rot: [number, number, number] };
// A stable spot a curator can hang a free-standing painting (in-museum editor):
// atrium walls + every wing's walls. Generated from room geometry so the DB only
// ever stores an opaque slotKey, never coordinates.
export type WallAnchor = {
  slotKey: string;
  position: [number, number, number];
  rotation: [number, number, number];
  // The coordinate that slides along this wall (0 = x, 2 = z) and its clamp
  // range, so nudging can't push a piece off the wall into open room.
  axis: 0 | 2;
  lo: number;
  hi: number;
};
export type Layout = {
  rooms: Room[];
  walk: AABB[];
  labels: LabelSpec[];
  galleries: GalleryBuild[];
  lights: [number, number][];
  nav: Nav[];
  hints: Hint[];
  wallAnchors: WallAnchor[];
};

export const rect = (x0: number, x1: number, z0: number, z1: number): AABB => ({ x0, x1, z0, z1 });
export const inset = (a: AABB, d: number): AABB => rect(a.x0 + d, a.x1 - d, a.z0 + d, a.z1 - d);
export const ctrX = (a: AABB) => (a.x0 + a.x1) / 2;
export const ctrZ = (a: AABB) => (a.z0 + a.z1) / 2;
export const opp = (s: Side): Side => (s === "N" ? "S" : s === "S" ? "N" : s === "W" ? "E" : "W");

export function neighbor(from: AABB, side: Side, len: number, half: number): AABB {
  const mx = ctrX(from);
  const mz = ctrZ(from);
  if (side === "N") return rect(mx - half, mx + half, from.z0 - len, from.z0);
  if (side === "S") return rect(mx - half, mx + half, from.z1, from.z1 + len);
  if (side === "W") return rect(from.x0 - len, from.x0, mz - half, mz + half);
  return rect(from.x1, from.x1 + len, mz - half, mz + half); // E
}

// Cut a doorway between two adjacent rooms and add a walkable bridge across it.
export function open(a: Room, b: Room, side: Side, half: number, walk: AABB[]) {
  if (side === "N" || side === "S") {
    const c = (Math.max(a.rect.x0, b.rect.x0) + Math.min(a.rect.x1, b.rect.x1)) / 2;
    const boundary = side === "N" ? a.rect.z0 : a.rect.z1;
    a.gaps.push({ side, lo: c - half, hi: c + half });
    b.gaps.push({ side: opp(side), lo: c - half, hi: c + half });
    walk.push(rect(c - (half - 0.2), c + (half - 0.2), boundary - BRIDGE, boundary + BRIDGE));
  } else {
    const c = (Math.max(a.rect.z0, b.rect.z0) + Math.min(a.rect.z1, b.rect.z1)) / 2;
    const boundary = side === "W" ? a.rect.x0 : a.rect.x1;
    a.gaps.push({ side, lo: c - half, hi: c + half });
    b.gaps.push({ side: opp(side), lo: c - half, hi: c + half });
    walk.push(rect(boundary - BRIDGE, boundary + BRIDGE, c - (half - 0.2), c + (half - 0.2)));
  }
}

// A corridor poking out of `from`, opening into a room. Returns the room.
export function connect(
  rooms: Room[],
  walk: AABB[],
  from: Room,
  side: Side,
  corrLen: number,
  roomHalf: number
): Room {
  const corr: Room = { rect: neighbor(from.rect, side, corrLen, CORR_HALF), gaps: [] };
  const room: Room = { rect: neighbor(corr.rect, side, 2 * roomHalf, roomHalf), gaps: [] };
  rooms.push(corr, room);
  open(from, corr, side, DOOR_HALF, walk);
  open(corr, room, side, DOOR_HALF, walk);
  walk.push(inset(corr.rect, 0.4));
  walk.push(inset(room.rect, INSET));
  return room;
}

// Which outward walls of a wing hold galleries (never the wall facing the atrium).
export function collectionSides(wingSide: Side): Side[] {
  if (wingSide === "W") return ["W", "N", "S"];
  if (wingSide === "N") return ["N", "W", "E"];
  return ["E", "N", "S"]; // E
}

export const faceRot = (side: Side): [number, number, number] =>
  side === "N"
    ? [0, 0, 0]
    : side === "S"
    ? [0, Math.PI, 0]
    : side === "W"
    ? [0, Math.PI / 2, 0]
    : [0, -Math.PI / 2, 0];

export const outwardYaw = (side: Side) =>
  side === "N" ? 0 : side === "S" ? Math.PI : side === "W" ? Math.PI / 2 : -Math.PI / 2;

// Two flanking painting spots per wall (they clear the centred doorway). Anchor
// positions are computed from room geometry in buildLayout and carried on the
// layout; the DB only ever stores the opaque slotKey.
export const WALL_ART_OFFSETS = [-3.2, 3.2];

export function buildMuseum(m: Museum, editing = false): Layout {
  const rooms: Room[] = [];
  const walk: AABB[] = [];
  const labels: LabelSpec[] = [];
  const galleries: GalleryBuild[] = [];
  const lights: [number, number][] = [[0, 0]];
  const nav: Nav[] = [];

  const atrium: Room = { rect: rect(-A, A, -A, A), gaps: [] };
  rooms.push(atrium);
  walk.push(inset(atrium.rect, INSET));

  // entrance vestibule (south)
  const vest: Room = { rect: neighbor(atrium.rect, "S", VEST_LEN, VEST_HALF), gaps: [] };
  rooms.push(vest);
  open(atrium, vest, "S", ENTR_HALF, walk);
  walk.push(inset(vest.rect, INSET));

  // museum name above the entrance, facing the arriving visitor
  labels.push({
    text: m.name.toUpperCase(),
    pos: [0, DOORH + 0.5, A + 0.06],
    rot: [0, 0, 0],
    size: 0.4,
    maxW: ENTR_HALF * 2 - SIGN_MARGIN, // the entrance opening it sits over
  });

  // Placement: the CENTRE door fills first, so the first wing is straight ahead
  // as you walk in; left and right open up as more wings are added. The default
  // "unfiled" wing takes the centre when it exists; otherwise the first wing the
  // curator created does. (A 4th+ wing spills into the Directory.)
  const defaultWing = m.wings.find((w) => w.isDefault) ?? null;
  const namedWings = m.wings.filter((w) => !w.isDefault);
  const ordered = defaultWing ? [defaultWing, ...namedWings] : namedWings;
  // In edit mode the whole museum is open: pad to three walkable wings so the
  // owner can walk in and place art (or, later, create galleries) on any wing
  // wall. Visitors only ever get the wings that actually have content.
  if (editing) {
    while (ordered.length < 3) ordered.push({ name: "", collections: [] });
  }
  const CENTER_FIRST: Side[] = ["N", "W", "E"];
  const placements: { wing: Wing; side: Side }[] = ordered
    .slice(0, 3)
    .map((wing, i) => ({ wing, side: CENTER_FIRST[i] }));

  // A placard on each atrium wall that isn't a wing yet, guiding the curator to
  // open it by creating another wing.
  const hints: Hint[] = [];
  const usedSides = new Set<Side>(placements.map((p) => p.side));
  (["W", "N", "E"] as Side[]).forEach((side) => {
    if (usedSides.has(side)) return;
    const y = 2.35;
    if (side === "W") hints.push({ pos: [-A + 0.06, y, 0], rot: [0, Math.PI / 2, 0] });
    else if (side === "N") hints.push({ pos: [0, y, -A + 0.06], rot: [0, 0, 0] });
    else hints.push({ pos: [A - 0.06, y, 0], rot: [0, -Math.PI / 2, 0] });
  });

  // Editor wall anchors: two flanking spots on each wall of the atrium and of
  // every wing. Keyed by a stable prefix so placements survive across sessions.
  const wallAnchors: WallAnchor[] = [];
  const addWallAnchors = (prefix: string, rect: AABB, s: Side) => {
    const cx = ctrX(rect);
    const cz = ctrZ(rect);
    const horiz = s === "N" || s === "S"; // slides along x on N/S walls, z on E/W
    const axis: 0 | 2 = horiz ? 0 : 2;
    const M = 1.1; // keep art off the corners
    const lo = horiz ? rect.x0 + M : rect.z0 + M;
    const hi = horiz ? rect.x1 - M : rect.z1 - M;
    WALL_ART_OFFSETS.forEach((off, i) => {
      const position: [number, number, number] =
        s === "N"
          ? [cx + off, ART_Y, rect.z0 + 0.12]
          : s === "S"
          ? [cx + off, ART_Y, rect.z1 - 0.12]
          : s === "W"
          ? [rect.x0 + 0.12, ART_Y, cz + off]
          : [rect.x1 - 0.12, ART_Y, cz + off];
      wallAnchors.push({ slotKey: `${prefix}:${s}:${i}`, position, rotation: faceRot(s), axis, lo, hi });
    });
  };
  (["N", "S", "E", "W"] as Side[]).forEach((s) => addWallAnchors("atrium", atrium.rect, s));

  placements.forEach(({ wing, side }) => {
    const wingRoom = connect(rooms, walk, atrium, side, ATR_WING_CORR, WING_HALF);
    lights.push([ctrX(wingRoom.rect), ctrZ(wingRoom.rect)]);

    // Wing walls get anchors too, keyed by the wing's ATRIUM SIDE (stable for
    // empty/placeholder wings and collision-free, unlike a name slug).
    (["N", "S", "E", "W"] as Side[]).forEach((s) =>
      addWallAnchors(`wing:${side}`, wingRoom.rect, s)
    );

    // A NAMED wing gets its name over its atrium doorway; an unnamed/placeholder
    // (compass-only) wing stays unlabeled — no "West Wing" plastered over a room.
    // Offset past the wall thickness (0.3) + the abutting corridor wall that
    // pokes into this room at the doorway, so the sign floats clear in the room
    // rather than getting buried inside that protruding wall.
    const LO = 0.45;
    const wl =
      side === "W"
        ? { pos: [-A + LO, DOORH + 0.4, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] }
        : side === "N"
        ? { pos: [0, DOORH + 0.4, -A + LO] as [number, number, number], rot: [0, 0, 0] as [number, number, number] }
        : { pos: [A - LO, DOORH + 0.4, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number] };
    if (wing.name)
      labels.push({
        text: wing.name.toUpperCase(),
        pos: wl.pos,
        rot: wl.rot,
        size: 0.34,
        maxW: CORR_HALF * 2 - SIGN_MARGIN, // the atrium-to-wing corridor mouth
      });

    const cSides = collectionSides(side);
    wing.collections.forEach((coll, j) => {
      if (j >= 3) {
        // overflow: teleport to the wing itself
        nav.push({
          wing: wing.name,
          name: coll.name,
          spawn: [ctrX(wingRoom.rect), EYE_Y, ctrZ(wingRoom.rect)],
          yaw: outwardYaw(side),
        });
        return;
      }
      const cs = cSides[j];
      const room = connect(rooms, walk, wingRoom, cs, WING_COLL_CORR, COLL_HALF);
      lights.push([ctrX(room.rect), ctrZ(room.rect)]);
      const r = room.rect;

      // gallery name on the wing wall, over the doorway, facing into the wing
      const wr = wingRoom.rect;
      // Same 0.45 clearance as wing labels: past this wall's thickness and the
      // gallery corridor wall that protrudes into the wing at the doorway.
      const GLO = 0.45;
      // The wing-to-gallery corridor mouth is the band this sign is painted on.
      const gW = CORR_HALF * 2 - SIGN_MARGIN;
      const gl: LabelSpec =
        cs === "N"
          ? { text: coll.name, pos: [ctrX(wr), DOORH + 0.3, wr.z0 + GLO], rot: [0, 0, 0], size: 0.28, maxW: gW }
          : cs === "S"
          ? { text: coll.name, pos: [ctrX(wr), DOORH + 0.3, wr.z1 - GLO], rot: [0, Math.PI, 0], size: 0.28, maxW: gW }
          : cs === "W"
          ? { text: coll.name, pos: [wr.x0 + GLO, DOORH + 0.3, ctrZ(wr)], rot: [0, Math.PI / 2, 0], size: 0.28, maxW: gW }
          : { text: coll.name, pos: [wr.x1 - GLO, DOORH + 0.3, ctrZ(wr)], rot: [0, -Math.PI / 2, 0], size: 0.28, maxW: gW };
      labels.push(gl);

      // preview artwork on the gallery's far wall (shown until the full
      // collection streams in as you approach)
      const previewPos: [number, number, number] =
        cs === "N"
          ? [ctrX(r), ART_Y, r.z0 + 0.12]
          : cs === "S"
          ? [ctrX(r), ART_Y, r.z1 - 0.12]
          : cs === "W"
          ? [r.x0 + 0.12, ART_Y, ctrZ(r)]
          : [r.x1 - 0.12, ART_Y, ctrZ(r)];
      galleries.push({
        slug: coll.slug,
        name: coll.name,
        room: r,
        entrySide: opp(cs),
        previewPos,
        previewRot: faceRot(cs),
        pieces: coll.pieces,
      });
      // No free-placement anchors inside galleries: a gallery holds only its
      // own collection (up to GALLERY_CAP pieces), so its 3D room and 2D page
      // always match. Curate it with the "Add" button in the edit panel.

      // teleport target: just inside the doorway, facing the far wall
      const spawn: [number, number, number] =
        cs === "N"
          ? [ctrX(r), EYE_Y, r.z1 - 1.8]
          : cs === "S"
          ? [ctrX(r), EYE_Y, r.z0 + 1.8]
          : cs === "W"
          ? [r.x1 - 1.8, EYE_Y, ctrZ(r)]
          : [r.x0 + 1.8, EYE_Y, ctrZ(r)];
      nav.push({ wing: wing.name, name: coll.name, spawn, yaw: outwardYaw(cs) });
    });
  });

  return { rooms, walk, labels, galleries, lights, nav, hints, wallAnchors };
}

// ---- hanging ----

const CORNER_M = 1.1; // art stays this far off a room corner
const MIN_GAP = 0.8; // pieces sharing a wall never come closer than this
const MAX_GAP = 2.4; // ...nor drift further apart than this
const DOOR_CLEAR = 0.15; // a piece beside the doorway stays this far off the opening
const DOOR_BREATHE = 0.4; // ...and this far when there is room to spare
const MIN_SCALE = 0.2; // a floor so an impossible wall still shows something
// A hung piece never reserves less than this, however small it is or however
// far it is scaled down: it covers the frame and the 0.82m nameplate.
const MIN_RESERVED_W = 1.2;

// The wall space a piece takes when drawn at `scale`: the box it is drawn in
// (displaySize — the same call the renderer makes) scaled, but never narrower
// than MIN_RESERVED_W.
export function reservedSize(p: GalleryPiece, scale = 1): { w: number; h: number } {
  const box = displaySize(p);
  return { w: Math.max(MIN_RESERVED_W, box.w * scale), h: box.h * scale };
}

// The largest scale, at most 1, at which these pieces fit side by side on a
// wall `len` long with `gap` between them. Pieces that already fit are left at
// their real size. Pieces that don't are shrunk TOGETHER, so their relative
// sizes stay honest — a Night Watch beside a miniature still reads as enormous.
//
// This is what makes overflow impossible rather than unlikely. Before it, the
// only defences were a cap on the piece count and a clamped gap, and a wall of
// wide works (screens, handscrolls) simply ran past both corners.
export function wallScale(pieces: GalleryPiece[], len: number, gap: number): number {
  const need = (s: number) =>
    pieces.reduce((t, p) => t + reservedSize(p, s).w, 0) + gap * Math.max(0, pieces.length - 1);
  if (need(1) <= len) return 1;
  let lo = MIN_SCALE;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (need(mid) <= len) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Where one piece hangs. `scale` is how much the renderer must shrink the piece
// from its displaySize() so it fits the wall it was given; 1 means real size.
export type Spot = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

// Lift a tall piece so its bottom edge clears the floor.
const hangY = (h: number) => Math.max(ART_Y, h / 2 + 0.35);

// Distribute a collection's pieces across the three non-doorway walls of a
// gallery room, spacing by each piece's real width, centred per wall. The last
// up-to-2 pieces flank the doorway on the entry wall.
export function hangRoom(room: AABB, entrySide: Side, pieces: GalleryPiece[]): Spot[] {
  const M = CORNER_M;
  const out: Spot[] = new Array(pieces.length);
  const horizOf = (side: Side) => side === "N" || side === "S";
  // A point on `side`'s wall, `c` along it and `y` up it.
  const onWall = (side: Side, c: number, y: number): [number, number, number] =>
    side === "N"
      ? [c, y, room.z0 + 0.12]
      : side === "S"
      ? [c, y, room.z1 - 0.12]
      : side === "W"
      ? [room.x0 + 0.12, y, c]
      : [room.x1 - 0.12, y, c];

  // First GALLERY_CAP-2 pieces auto-arrange across the 3 solid walls.
  const mainCount = Math.min(pieces.length, GALLERY_CAP - 2);
  const sides = (["N", "S", "W", "E"] as Side[]).filter((s) => s !== entrySide);
  const bins = sides.map((side) => {
    const a = horizOf(side) ? room.x0 + M : room.z0 + M;
    const b = horizOf(side) ? room.x1 - M : room.z1 - M;
    return { side, a, b, len: b - a, items: [] as number[], used: 0 };
  });
  const GAP = 1.2; // nominal, only for balancing pieces across the walls
  for (let i = 0; i < mainCount; i++) {
    const w = reservedSize(pieces[i]).w;
    let best = 0;
    let bestScore = Infinity;
    bins.forEach((bin, k) => {
      const need = bin.used + (bin.items.length ? GAP : 0) + w;
      const score = need / bin.len;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    });
    bins[best].used += (bins[best].items.length ? GAP : 0) + w;
    bins[best].items.push(i);
  }
  bins.forEach((bin) => {
    const n = bin.items.length;
    // Shrink this wall's pieces together if they cannot fit at real size.
    const scale = wallScale(bin.items.map((i) => pieces[i]), bin.len, MIN_GAP);
    const sizes = bin.items.map((i) => reservedSize(pieces[i], scale));
    const sumW = sizes.reduce((s, z) => s + z.w, 0);
    // Even spacing, bounded at both ends: pieces must never touch, and must not
    // drift so far apart that a wall of small works reads as two stamps in a
    // field. Letting the gap grow to fill the wall was tried and looked worse —
    // Cleveland's landscapes are genuinely 0.25-0.5m, and spreading them corner
    // to corner made the room look abandoned.
    const gap = n > 1 ? Math.max(MIN_GAP, Math.min(MAX_GAP, (bin.len - sumW) / (n - 1))) : 0;
    let cursor = (bin.a + bin.b) / 2 - (sumW + gap * (n - 1)) / 2;
    bin.items.forEach((i, k) => {
      const { w, h } = sizes[k];
      out[i] = {
        position: onWall(bin.side, cursor + w / 2, hangY(h)),
        rotation: faceRot(bin.side),
        scale,
      };
      cursor += w + gap;
    });
  });

  // The entry wall has two slots only — one each side of the doorway. Anything
  // beyond that has nowhere to go, and is not hung: stacking the surplus once
  // put two paintings on one point, which z-fought into a checkerboard of both.
  // Callers cap at GALLERY_CAP; this makes the limit structural.
  const wallHalf = (horizOf(entrySide) ? room.x1 - room.x0 : room.z1 - room.z0) / 2;
  const mid = horizOf(entrySide) ? (room.x0 + room.x1) / 2 : (room.z0 + room.z1) / 2;
  // Each slot runs from just clear of the opening to the corner margin. A
  // piece wider than that is shrunk to fit, so it cannot hang over the doorway.
  const slotLen = wallHalf - M - DOOR_HALF - DOOR_CLEAR;
  const entrySlots = Math.min(pieces.length - mainCount, 2);
  for (let i = mainCount; i < mainCount + entrySlots; i++) {
    const sign = i === mainCount ? -1 : 1;
    const scale = wallScale([pieces[i]], slotLen, 0);
    const { w, h } = reservedSize(pieces[i], scale);
    // Ideal: inner edge a comfortable step past the doorway. A wide piece gives
    // that up and slides toward the opening so its outer edge stays off the corner.
    const ideal = DOOR_HALF + DOOR_BREATHE + w / 2;
    const maxC = wallHalf - M - w / 2;
    out[i] = {
      position: onWall(entrySide, mid + sign * Math.min(ideal, maxC), hangY(h)),
      rotation: faceRot(entrySide),
      scale,
    };
  }
  return out;
}
