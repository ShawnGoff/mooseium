"use client";

// The 3D museum as ONE connected, walkable world.
// Structure: Entrance → Atrium → Wings → Galleries → Art.
//   • The atrium is the central hall you walk into. Up to three wings open off
//     it (left / ahead / right), each reached down a short corridor.
//   • Each wing is a room; its galleries (the curator's collections) open off
//     its outward walls as rooms you walk into.
//   • Everything is a single continuous space — no scene swaps. The Directory
//     teleports you straight to any gallery.
// Isolated under /lab; reads ?u=<handle>.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text, MeshReflectorMaterial } from "@react-three/drei";
import DenPanel from "../../den/DenPanel";
import {
  Player,
  ProxyArtwork,
  JoystickPad,
  EYE_Y,
  ART_Y,
  MUSEUM_LABEL,
  type Piece,
  type GalleryPiece,
  type Constrain,
} from "../gallery3d";
import Tour, { type TourStep } from "@/app/components/Tour";

const MUSEUM_TOUR_STEPS: TourStep[] = [
  {
    title: "Walk around",
    body: "Use WASD or the on-screen joystick to move, and drag anywhere to look around.",
  },
  {
    target: '[data-tour="directory"]',
    title: "Jump anywhere",
    body: "The Directory teleports you straight to any gallery or wing.",
  },
  {
    target: '[data-tour="weather"]',
    title: "Set the mood",
    body: "Toggle day, night, rain, or snow, and flip the lights.",
  },
  {
    target: '[data-tour="music"]',
    title: "Background music",
    body: "Pick a track to play while you explore.",
  },
  {
    title: "Look closer",
    body: "Walk up to any artwork and click it for the full details. Enjoy your museum! 🫎",
  },
];

type Collection = { id: string; name: string; slug: string; count: number };
type Wing = { name: string; collections: Collection[]; isDefault?: boolean };
type Museum = { name: string; curator: string; handle: string; wings: Wing[] };

// ---- dimensions (metres) ----
const A = 7; // atrium half-size
const H = 6; // wall height
const DOORH = 3.6; // doorway height
const CORR_HALF = 1.8; // corridor half-width
const DOOR_HALF = 1.5; // doorway half-width
const WING_HALF = 5; // wing room half-size
const GALLERY_CAP = 11; // max pieces a gallery displays (3 walls + entry wall)
const COLL_HALF = 4.5; // gallery room half-size
const ATR_WING_CORR = 10; // atrium→wing corridor length (spaces the wings out)
const WING_COLL_CORR = 3; // wing→gallery corridor length
const VEST_HALF = 6; // entrance vestibule / Den half-width
const VEST_LEN = 14; // entrance vestibule / Den depth
const ENTR_HALF = 2; // entrance doorway half-width
const EPS = 0.03; // wall inset so shared walls don't z-fight
const INSET = 0.4; // walkable inset from walls
const BRIDGE = 0.75; // half-depth of a doorway's walkable bridge

type Side = "N" | "S" | "E" | "W"; // N=-z, S=+z, E=+x, W=-x
type AABB = { x0: number; x1: number; z0: number; z1: number };
type Room = { rect: AABB; gaps: { side: Side; lo: number; hi: number }[] };
type LabelSpec = { text: string; pos: [number, number, number]; rot: [number, number, number]; size: number };
// A gallery room: its slug, the room rectangle, which wall is the doorway
// (entrySide) and which is the far/feature wall, plus where the single preview
// piece hangs when the full collection isn't loaded.
type GalleryBuild = {
  slug: string;
  name: string;
  room: AABB;
  entrySide: Side;
  previewPos: [number, number, number];
  previewRot: [number, number, number];
};
type Nav = { wing: string; name: string; spawn: [number, number, number]; yaw: number };
type Hint = { pos: [number, number, number]; rot: [number, number, number] };
// A stable spot a curator can hang a free-standing painting (in-museum editor):
// atrium walls + every wing's walls. Generated from room geometry so the DB only
// ever stores an opaque slotKey, never coordinates.
type WallAnchor = {
  slotKey: string;
  position: [number, number, number];
  rotation: [number, number, number];
  // The coordinate that slides along this wall (0 = x, 2 = z) and its clamp
  // range, so nudging can't push a piece off the wall into open room.
  axis: 0 | 2;
  lo: number;
  hi: number;
};
type Layout = {
  rooms: Room[];
  walk: AABB[];
  labels: LabelSpec[];
  galleries: GalleryBuild[];
  lights: [number, number][];
  nav: Nav[];
  hints: Hint[];
  wallAnchors: WallAnchor[];
};

// Roman inscriptional serif for the signage — the lettering carved over real
// museum entrances. troika loads this .woff at runtime (falls back gracefully).
const MUSEUM_FONT =
  "https://cdn.jsdelivr.net/npm/@fontsource/cinzel@5.2.8/files/cinzel-latin-600-normal.woff";

// Background music. Drop .mp3 files in /public and add { name, src } entries;
// the track menu lets visitors pick one, and it loops until they choose another.
// (src paths URL-encode the spaces in the filenames.)
const MUSIC_TRACKS: { name: string; src: string }[] = [
  { name: "Acoustic", src: "/Acoustic.mp3" },
  { name: "Art Gallery", src: "/Art%20Gallery.mp3" },
  { name: "Chill 1", src: "/Chill%201.mp3" },
  { name: "Chill 2", src: "/Chill%202.mp3" },
  { name: "Jazz 1", src: "/jazz.mp3" },
  { name: "Jazz 2", src: "/jazz2.mp3" },
  { name: "Lo-Fi 1", src: "/Lofi%201.mp3" },
  { name: "Lo-Fi 2", src: "/Lofi%202.mp3" },
];

const rect = (x0: number, x1: number, z0: number, z1: number): AABB => ({ x0, x1, z0, z1 });
const inset = (a: AABB, d: number): AABB => rect(a.x0 + d, a.x1 - d, a.z0 + d, a.z1 - d);
const ctrX = (a: AABB) => (a.x0 + a.x1) / 2;
const ctrZ = (a: AABB) => (a.z0 + a.z1) / 2;
const opp = (s: Side): Side => (s === "N" ? "S" : s === "S" ? "N" : s === "W" ? "E" : "W");

function neighbor(from: AABB, side: Side, len: number, half: number): AABB {
  const mx = ctrX(from);
  const mz = ctrZ(from);
  if (side === "N") return rect(mx - half, mx + half, from.z0 - len, from.z0);
  if (side === "S") return rect(mx - half, mx + half, from.z1, from.z1 + len);
  if (side === "W") return rect(from.x0 - len, from.x0, mz - half, mz + half);
  return rect(from.x1, from.x1 + len, mz - half, mz + half); // E
}

// Cut a doorway between two adjacent rooms and add a walkable bridge across it.
function open(a: Room, b: Room, side: Side, half: number, walk: AABB[]) {
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
function connect(
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
function collectionSides(wingSide: Side): Side[] {
  if (wingSide === "W") return ["W", "N", "S"];
  if (wingSide === "N") return ["N", "W", "E"];
  return ["E", "N", "S"]; // E
}

const faceRot = (side: Side): [number, number, number] =>
  side === "N"
    ? [0, 0, 0]
    : side === "S"
    ? [0, Math.PI, 0]
    : side === "W"
    ? [0, Math.PI / 2, 0]
    : [0, -Math.PI / 2, 0];

const outwardYaw = (side: Side) =>
  side === "N" ? 0 : side === "S" ? Math.PI : side === "W" ? Math.PI / 2 : -Math.PI / 2;

// A free-standing painting the curator hung directly on a wall (in-museum
// editor), outside the gallery collections. Denormalized so the 3D can hang it.
type WallPlacement = {
  slotKind: string;
  slotKey: string;
  source: string;
  externalId: string;
  rotationY: number;
  mount: string;
  // Explicit world position once the curator has dragged it; null = use the
  // slot anchor. Rotation always comes from the wall anchor (paintings stay flat).
  pos?: [number, number, number] | null;
  piece: GalleryPiece;
};

// Two flanking painting spots per wall (they clear the centred doorway). Anchor
// positions are computed from room geometry in buildLayout and carried on the
// layout; the DB only ever stores the opaque slotKey.
const WALL_ART_OFFSETS = [-3.2, 3.2];

// A clickable "+" marker at an empty wall anchor. Owner-only (only rendered
// while editing). Clicking opens the art picker for that slot.
function Hotspot({ anchor, onPick }: { anchor: WallAnchor; onPick: (k: string) => void }) {
  return (
    <group position={anchor.position} rotation={anchor.rotation}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onPick(anchor.slotKey);
        }}
      >
        <planeGeometry args={[1.7, 1.3]} />
        <meshBasicMaterial
          color="#c8a15a"
          transparent
          opacity={0.16}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Text position={[0, 0, 0.03]} fontSize={0.55} color="#f0dfb0" anchorX="center" anchorY="middle">
        +
      </Text>
    </group>
  );
}

// Art picker for the in-museum editor: search every museum, tap a result to
// hang it. Resolves the display image via /api/artwork so walls aren't fed
// tiny thumbnails.
type PickCard = {
  sourceMuseum: string;
  museumObjectId: string;
  title: string;
  artist?: string;
  thumbnailUrl: string;
};
type FullArt = {
  image?: string;
  artist?: string;
  dateText?: string;
  medium?: string;
  description?: string;
  sourceUrl?: string;
};
function ArtPicker({
  onClose,
  onPlace,
  title = "Place art on this wall",
  placeLabel = "Place on this wall",
}: {
  onClose: () => void;
  onPlace: (art: { source: string; externalId: string; title: string; image: string }) => void;
  title?: string;
  placeLabel?: string;
}) {
  const [q, setQ] = useState("");
  const [museum, setMuseum] = useState("all");
  const [museums, setMuseums] = useState<{ slug: string; displayName: string }[]>([]);
  const [cards, setCards] = useState<PickCard[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ card: PickCard; full: FullArt | null } | null>(null);

  useEffect(() => {
    fetch("/api/museums")
      .then((r) => r.json())
      .then((d) => setMuseums((d.museums as { slug: string; displayName: string }[]) ?? []))
      .catch(() => {});
  }, []);

  async function fetchPage(p: number, append: boolean) {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/search?museum=${encodeURIComponent(museum)}&q=${encodeURIComponent(q)}&page=${p}`
      );
      const d = await r.json();
      const next = ((d.cards as PickCard[]) ?? []).filter((c) => c.thumbnailUrl);
      setCards((prev) => (append && prev ? [...prev, ...next] : next));
      setHasMore(Boolean(d.hasMore));
      setPage(p);
    } catch {
      if (!append) setCards([]);
    }
    setBusy(false);
  }
  const run = () => fetchPage(1, false);
  const more = () => fetchPage(page + 1, true);

  // Clicking a result opens a larger preview with full details instead of
  // placing immediately, so you can inspect a piece before committing.
  async function openPreview(c: PickCard) {
    setPreview({ card: c, full: null });
    try {
      const r = await fetch(
        `/api/artwork?museum=${encodeURIComponent(c.sourceMuseum)}&objectId=${encodeURIComponent(c.museumObjectId)}`
      );
      const d = await r.json();
      if (d.artwork) setPreview({ card: c, full: d.artwork as FullArt });
    } catch {
      /* keep the basic preview */
    }
  }
  function placePreview() {
    if (!preview) return;
    const c = preview.card;
    onPlace({
      source: c.sourceMuseum,
      externalId: c.museumObjectId,
      title: c.title,
      image: preview.full?.image || c.thumbnailUrl,
    });
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 340,
        background: "rgba(16,13,10,0.97)",
        borderLeft: "1px solid #4a4030",
        padding: 14,
        color: "#ece0c8",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{title}</strong>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "#ece0c8", cursor: "pointer", fontSize: 16 }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 6 }}
      >
        <select
          value={museum}
          onChange={(e) => setMuseum(e.target.value)}
          aria-label="Museum to search"
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid #4a4030",
            background: "#0e0b08",
            color: "#ece0c8",
            fontSize: 13,
          }}
        >
          <option value="all">All museums</option>
          {museums.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.displayName}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #4a4030",
              background: "#0e0b08",
              color: "#ece0c8",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "0 12px",
              borderRadius: 6,
              border: "1px solid #c8a15a",
              background: "transparent",
              color: "#e6d3a3",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Search
          </button>
        </div>
      </form>
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {busy && page === 1 && <div style={{ fontSize: 13, opacity: 0.7 }}>Searching…</div>}
        {cards && cards.length === 0 && !busy && (
          <div style={{ fontSize: 13, opacity: 0.7 }}>No results.</div>
        )}
        {(cards ?? []).map((c) => (
          <button
            key={`${c.sourceMuseum}:${c.museumObjectId}`}
            onClick={() => openPreview(c)}
            title={c.title}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              width: "100%",
              padding: 6,
              border: "1px solid #332c22",
              borderRadius: 8,
              background: "transparent",
              color: "#ece0c8",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.thumbnailUrl}
              alt=""
              style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.title}
              </div>
              {c.artist && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#b8afa2",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.artist}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: "#c8a15a",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {MUSEUM_LABEL[c.sourceMuseum] ?? c.sourceMuseum}
              </div>
            </div>
          </button>
        ))}
        {hasMore && cards && cards.length > 0 && (
          <button
            onClick={more}
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 4,
              padding: "7px 0",
              borderRadius: 6,
              border: "1px solid #4a4030",
              background: "transparent",
              color: "#e6d3a3",
              cursor: busy ? "default" : "pointer",
              fontSize: 13,
            }}
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {preview && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(16,13,10,0.98)",
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              onClick={() => setPreview(null)}
              style={{ background: "transparent", border: "none", color: "#e6d3a3", cursor: "pointer", fontSize: 13 }}
            >
              ← Back
            </button>
            <button
              onClick={onClose}
              style={{ background: "transparent", border: "none", color: "#ece0c8", cursor: "pointer", fontSize: 16 }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.full?.image || preview.card.thumbnailUrl}
              alt=""
              style={{ width: "100%", borderRadius: 8, marginBottom: 10, display: "block" }}
            />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>{preview.card.title}</div>
            {(preview.full?.artist || preview.card.artist) && (
              <div style={{ color: "#b8afa2", fontSize: 13 }}>
                {preview.full?.artist || preview.card.artist}
              </div>
            )}
            <div style={{ color: "#c8a15a", fontSize: 12, marginBottom: 8 }}>
              {MUSEUM_LABEL[preview.card.sourceMuseum] ?? preview.card.sourceMuseum}
            </div>
            {(preview.full?.dateText || preview.full?.medium) && (
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                {[preview.full?.dateText, preview.full?.medium].filter(Boolean).join(" · ")}
              </div>
            )}
            {preview.full?.description && (
              <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
                {preview.full.description}
              </div>
            )}
            {!preview.full && <div style={{ fontSize: 12, opacity: 0.6 }}>Loading details…</div>}
          </div>
          <button
            onClick={placePreview}
            style={{
              width: "100%",
              padding: "9px 0",
              borderRadius: 6,
              border: "1px solid #c8a15a",
              background: "rgba(200,161,90,0.14)",
              color: "#e6d3a3",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            {placeLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function buildMuseum(m: Museum, editing = false): Layout {
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

    // wing name above its atrium door, facing the atrium interior
    const wl =
      side === "W"
        ? { pos: [-A + 0.06, DOORH + 0.4, 0] as [number, number, number], rot: [0, Math.PI / 2, 0] as [number, number, number] }
        : side === "N"
        ? { pos: [0, DOORH + 0.4, -A + 0.06] as [number, number, number], rot: [0, 0, 0] as [number, number, number] }
        : { pos: [A - 0.06, DOORH + 0.4, 0] as [number, number, number], rot: [0, -Math.PI / 2, 0] as [number, number, number] };
    if (wing.name)
      labels.push({ text: wing.name.toUpperCase(), pos: wl.pos, rot: wl.rot, size: 0.34 });

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
      const gl: LabelSpec =
        cs === "N"
          ? { text: coll.name, pos: [ctrX(wr), DOORH + 0.3, wr.z0 + 0.06], rot: [0, 0, 0], size: 0.28 }
          : cs === "S"
          ? { text: coll.name, pos: [ctrX(wr), DOORH + 0.3, wr.z1 - 0.06], rot: [0, Math.PI, 0], size: 0.28 }
          : cs === "W"
          ? { text: coll.name, pos: [wr.x0 + 0.06, DOORH + 0.3, ctrZ(wr)], rot: [0, Math.PI / 2, 0], size: 0.28 }
          : { text: coll.name, pos: [wr.x1 - 0.06, DOORH + 0.3, ctrZ(wr)], rot: [0, -Math.PI / 2, 0], size: 0.28 };
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

// Distribute a collection's pieces across the three non-doorway walls of a
// gallery room, spacing by each piece's real width, centred per wall.
function hangRoom(
  room: AABB,
  entrySide: Side,
  pieces: GalleryPiece[]
): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const M = 1.1; // corner margin
  const sides = (["N", "S", "W", "E"] as Side[]).filter((s) => s !== entrySide);
  const bins = sides.map((side) => {
    const horiz = side === "N" || side === "S";
    const a = horiz ? room.x0 + M : room.z0 + M;
    const b = horiz ? room.x1 - M : room.z1 - M;
    const place = (c: number, y: number) => {
      const position: [number, number, number] =
        side === "N"
          ? [c, y, room.z0 + 0.12]
          : side === "S"
          ? [c, y, room.z1 - 0.12]
          : side === "W"
          ? [room.x0 + 0.12, y, c]
          : [room.x1 - 0.12, y, c];
      return { position, rotation: faceRot(side) };
    };
    return { a, b, len: b - a, place, items: [] as number[], used: 0 };
  });
  const sizeOf = (p: GalleryPiece) =>
    p.realW && p.realH
      ? { w: Math.min(4.8, Math.max(1.2, p.realW)), h: Math.min(3.8, Math.max(0.35, p.realH)) }
      : { w: 2.2, h: 1.6 };
  const GAP = 1.2; // nominal, only for balancing pieces across the walls
  pieces.forEach((p, i) => {
    const w = sizeOf(p).w;
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
  });
  const out: { position: [number, number, number]; rotation: [number, number, number] }[] =
    new Array(pieces.length);
  bins.forEach((bin) => {
    const n = bin.items.length;
    const widths = bin.items.map((i) => sizeOf(pieces[i]).w);
    const sumW = widths.reduce((s, w) => s + w, 0);
    // Even spacing: share the leftover wall width between pieces, clamped so they
    // never touch and never drift too far apart — regardless of size mix.
    const gap = n > 1 ? Math.max(0.7, Math.min(2.4, (bin.len - sumW) / (n - 1))) : 0;
    let cursor = (bin.a + bin.b) / 2 - (sumW + gap * (n - 1)) / 2;
    bin.items.forEach((i, k) => {
      const h = sizeOf(pieces[i]).h;
      out[i] = bin.place(cursor + widths[k] / 2, Math.max(ART_Y, h / 2 + 0.35));
      cursor += widths[k] + gap;
    });
  });
  return out;
}

// Full-collection loader for one gallery. Fetches (and caches) the pieces and
// hangs them; ProxyArtwork disposes its textures on unmount, freeing VRAM.
const pieceCache = new Map<string, GalleryPiece[]>();
function GalleryFull({
  gallery,
  onSelect,
}: {
  gallery: GalleryBuild;
  onSelect: (p: Piece) => void;
}) {
  const [pieces, setPieces] = useState<GalleryPiece[] | null>(
    pieceCache.get(gallery.slug) ?? null
  );
  useEffect(() => {
    if (pieceCache.has(gallery.slug)) {
      setPieces(pieceCache.get(gallery.slug)!);
      return;
    }
    let cancelled = false;
    fetch(`/api/gallery-pieces?slug=${encodeURIComponent(gallery.slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const ps = ((d.pieces ?? []) as GalleryPiece[]).slice(0, GALLERY_CAP);
        pieceCache.set(gallery.slug, ps);
        setPieces(ps);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gallery.slug]);
  const spots = useMemo(
    () => (pieces ? hangRoom(gallery.room, gallery.entrySide, pieces) : []),
    [pieces, gallery]
  );
  if (!pieces) return null;
  return (
    <>
      {pieces.map((p, i) => (
        <ProxyArtwork
          key={i}
          piece={p}
          position={spots[i].position}
          rotation={spots[i].rotation}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

// Watches the player's position and decides which galleries are "hot" (full
// collection mounted). Hysteresis + a hot-count cap keep VRAM bounded.
function Streamer({
  galleries,
  posRef,
  cap,
  onChange,
}: {
  galleries: GalleryBuild[];
  posRef: React.MutableRefObject<{ x: number; z: number }>;
  cap: number;
  onChange: (slugs: string[]) => void;
}) {
  const acc = useRef(0);
  const cur = useRef("");
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.25) return;
    acc.current = 0;
    const p = posRef.current;
    const LOAD_IN = 14;
    const LOAD_OUT = 22;
    const withD = galleries.map((g) => ({
      slug: g.slug,
      d: Math.hypot(p.x - ctrX(g.room), p.z - ctrZ(g.room)),
    }));
    const prev = new Set(cur.current ? cur.current.split("|") : []);
    const next = new Set<string>();
    withD.forEach((w) => {
      if (prev.has(w.slug) && w.d < LOAD_OUT) next.add(w.slug);
      if (w.d < LOAD_IN) next.add(w.slug);
    });
    let arr = [...next];
    if (arr.length > cap) {
      arr = arr
        .map((s) => ({ s, d: withD.find((w) => w.slug === s)!.d }))
        .sort((a, b) => a.d - b.d)
        .slice(0, cap)
        .map((x) => x.s);
    }
    const key = [...arr].sort().join("|");
    if (key !== cur.current) {
      cur.current = key;
      onChange(arr);
    }
  });
  return null;
}

// Wall segments around any number of doorway gaps along a straight wall.
function segmentsMulti(a: number, b: number, gaps: { lo: number; hi: number }[]) {
  const sorted = [...gaps].sort((p, q) => p.lo - q.lo);
  const segs: { center: number; len: number }[] = [];
  let cur = a;
  for (const g of sorted) {
    if (g.lo - cur > 0.1) segs.push({ center: (cur + g.lo) / 2, len: g.lo - cur });
    cur = Math.max(cur, g.hi);
  }
  if (b - cur > 0.1) segs.push({ center: (cur + b) / 2, len: b - cur });
  return segs;
}

function WallSide({
  axis,
  fixed,
  a,
  b,
  gaps,
}: {
  axis: "x" | "z";
  fixed: number;
  a: number;
  b: number;
  gaps: { lo: number; hi: number }[];
}) {
  const segs = segmentsMulti(a, b, gaps);
  return (
    <>
      {segs.map((s, i) =>
        axis === "x" ? (
          <group key={i}>
            <mesh position={[s.center, H / 2, fixed]}>
              <planeGeometry args={[s.len, H]} />
              <meshStandardMaterial color="#e7e3db" side={2} />
            </mesh>
            <mesh position={[s.center, 0.09, fixed]}>
              <boxGeometry args={[s.len, 0.18, 0.07]} />
              <meshStandardMaterial color="#c9c2b6" />
            </mesh>
            <mesh position={[s.center, H - 0.1, fixed]}>
              <boxGeometry args={[s.len, 0.14, 0.07]} />
              <meshStandardMaterial color="#f2efe8" />
            </mesh>
          </group>
        ) : (
          <group key={i}>
            <mesh position={[fixed, H / 2, s.center]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[s.len, H]} />
              <meshStandardMaterial color="#e7e3db" side={2} />
            </mesh>
            <mesh position={[fixed, 0.09, s.center]}>
              <boxGeometry args={[0.07, 0.18, s.len]} />
              <meshStandardMaterial color="#c9c2b6" />
            </mesh>
            <mesh position={[fixed, H - 0.1, s.center]}>
              <boxGeometry args={[0.07, 0.14, s.len]} />
              <meshStandardMaterial color="#f2efe8" />
            </mesh>
          </group>
        )
      )}
      {gaps.map((g, i) => {
        const c = (g.lo + g.hi) / 2;
        const w = g.hi - g.lo;
        return axis === "x" ? (
          <mesh key={"l" + i} position={[c, (DOORH + H) / 2, fixed]}>
            <planeGeometry args={[w, H - DOORH]} />
            <meshStandardMaterial color="#e7e3db" side={2} />
          </mesh>
        ) : (
          <mesh key={"l" + i} position={[fixed, (DOORH + H) / 2, c]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[w, H - DOORH]} />
            <meshStandardMaterial color="#e7e3db" side={2} />
          </mesh>
        );
      })}
    </>
  );
}

// Procedural hardwood floor texture (warm oak planks), generated once.
let _wood: THREE.Texture | null = null;
function woodTexture(): THREE.Texture {
  if (_wood) return _wood;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const shade = ["#6e4d31", "#664729", "#725033", "#5e4028"];
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = shade[i % shade.length];
    ctx.fillRect(i * 64, 0, 64, 256);
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(i * 64, 0);
    ctx.lineTo(i * 64, 256);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1;
    for (let g = 0; g < 8; g++) {
      const x = i * 64 + 5 + g * 7;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + 3, 90, x - 3, 170, x + 2, 256);
      ctx.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _wood = t;
  return t;
}

function RoomMesh({ room }: { room: Room }) {
  const R = room.rect;
  const r = inset(R, EPS);
  const floorTex = useMemo(() => {
    const t = woodTexture().clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set((R.x1 - R.x0) / 2.2, (R.z1 - R.z0) / 2.2);
    t.needsUpdate = true;
    return t;
  }, [R.x0, R.x1, R.z0, R.z1]);
  useEffect(() => () => floorTex.dispose(), [floorTex]);
  const g = (s: Side) => room.gaps.filter((x) => x.side === s).map((x) => ({ lo: x.lo, hi: x.hi }));
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ctrX(R), 0, ctrZ(R)]}>
        <planeGeometry args={[R.x1 - R.x0, R.z1 - R.z0]} />
        <meshStandardMaterial map={floorTex} roughness={0.55} metalness={0} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[ctrX(R), H, ctrZ(R)]}>
        <planeGeometry args={[R.x1 - R.x0, R.z1 - R.z0]} />
        <meshStandardMaterial color="#efece6" />
      </mesh>
      <WallSide axis="x" fixed={r.z0} a={r.x0} b={r.x1} gaps={g("N")} />
      <WallSide axis="x" fixed={r.z1} a={r.x0} b={r.x1} gaps={g("S")} />
      <WallSide axis="z" fixed={r.x0} a={r.z0} b={r.z1} gaps={g("W")} />
      <WallSide axis="z" fixed={r.x1} a={r.z0} b={r.z1} gaps={g("E")} />
    </>
  );
}

// A wall placard on an unopened wing wall, nudging the curator to create a wing.
function HintSign({ pos, rot }: Hint) {
  return (
    <group position={pos} rotation={rot}>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[3.9, 2.0]} />
        <meshStandardMaterial color="#c7b892" />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[3.6, 1.7]} />
        <meshStandardMaterial color="#f3eee2" emissive="#caa25c" emissiveIntensity={0.18} />
      </mesh>
      <Text
        font={MUSEUM_FONT}
        position={[0, 0.28, 0.06]}
        fontSize={0.24}
        color="#3a332e"
        anchorX="center"
        anchorY="middle"
        maxWidth={3.0}
        textAlign="center"
        letterSpacing={0.02}
        lineHeight={1.25}
      >
        Add more galleries to open up this wing
      </Text>
      <Text position={[0, -0.55, 0.06]} fontSize={0.15} color="#6a6157" anchorX="center" anchorY="middle" maxWidth={3.3} textAlign="center">
        Assign a collection to a new wing on its page
      </Text>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The Den — procedural furniture in the spawn room. Built from primitives so it
// works with no downloaded assets; swap in .glb models later via useGLTF.
// ---------------------------------------------------------------------------

const WOOD_DARK = "#3f2c1d";
const WOOD_MID = "#5c4227";
const BOOK_COLORS = ["#7c2f2f", "#2f4a6b", "#3f5f3a", "#6b532f", "#4a3560", "#83603a", "#566066"];

function BookRow({ y, width }: { y: number; width: number }) {
  const books: React.ReactElement[] = [];
  let x = -width / 2 + 0.04;
  let i = 0;
  // Chunkier books = ~14 per row instead of ~26 — roughly halves the mesh/draw
  // count of the shelves with no meaningful visual change.
  while (x < width / 2 - 0.1 && i < 16) {
    const w = 0.1 + (i % 3) * 0.028;
    const h = 0.3 + ((i * 7) % 5) * 0.03;
    const c = BOOK_COLORS[(i * 3) % BOOK_COLORS.length];
    books.push(
      <mesh key={i} position={[x + w / 2, y + h / 2, 0]} castShadow>
        <boxGeometry args={[w, h, 0.2]} />
        <meshStandardMaterial color={c} roughness={0.85} />
      </mesh>
    );
    x += w + 0.014;
    i++;
  }
  return <>{books}</>;
}

function Bookshelf({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const W = 2.4;
  const Ht = 2.6;
  const D = 0.4;
  const t = 0.06;
  const shelfYs = [0, 0.67, 1.34, 2.01, Ht - t];
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, Ht / 2, -D / 2 + t / 2]}>
        <boxGeometry args={[W, Ht, t]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[-W / 2 + t / 2, Ht / 2, 0]}>
        <boxGeometry args={[t, Ht, D]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      <mesh position={[W / 2 - t / 2, Ht / 2, 0]}>
        <boxGeometry args={[t, Ht, D]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.7} />
      </mesh>
      {shelfYs.map((y, i) => (
        <mesh key={i} position={[0, y + t / 2, 0]}>
          <boxGeometry args={[W - t * 2, t, D - t]} />
          <meshStandardMaterial color={WOOD_MID} roughness={0.7} />
        </mesh>
      ))}
      {[0.06, 0.73, 1.4, 2.07].map((y, i) => (
        <group key={i} position={[0, y, 0.03]}>
          <BookRow y={0} width={W - 0.28} />
        </group>
      ))}
    </group>
  );
}

function Desk({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const W = 1.8;
  const D = 0.85;
  const topY = 0.75;
  const leg = (x: number, z: number) => (
    <mesh position={[x, topY / 2, z]}>
      <boxGeometry args={[0.08, topY, 0.08]} />
      <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
    </mesh>
  );
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, topY, 0]} castShadow>
        <boxGeometry args={[W, 0.06, D]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.5} />
      </mesh>
      {/* modesty panel (back) */}
      <mesh position={[0, topY - 0.28, -D / 2 + 0.04]}>
        <boxGeometry args={[W - 0.2, 0.4, 0.04]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
      </mesh>
      {leg(-W / 2 + 0.1, -D / 2 + 0.1)}
      {leg(W / 2 - 0.1, -D / 2 + 0.1)}
      {leg(-W / 2 + 0.1, D / 2 - 0.1)}
      {leg(W / 2 - 0.1, D / 2 - 0.1)}
      {/* a closed book + lamp glow on the desk */}
      <mesh position={[0.4, topY + 0.05, 0]} rotation={[0, 0.3, 0]}>
        <boxGeometry args={[0.32, 0.05, 0.24]} />
        <meshStandardMaterial color="#6b2f2f" roughness={0.8} />
      </mesh>
      <mesh position={[-0.55, topY + 0.16, -0.15]}>
        <sphereGeometry args={[0.1, 12, 12]} />
        <meshStandardMaterial color="#fff3d0" emissive="#ffdf9e" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function Chair({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.46, 0]} castShadow>
        <boxGeometry args={[0.5, 0.07, 0.5]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.75, -0.22]}>
        <boxGeometry args={[0.5, 0.55, 0.06]} />
        <meshStandardMaterial color={WOOD_MID} roughness={0.6} />
      </mesh>
      {[
        [-0.21, -0.21],
        [0.21, -0.21],
        [-0.21, 0.21],
        [0.21, 0.21],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.23, z]}>
          <boxGeometry args={[0.06, 0.46, 0.06]} />
          <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Armchair({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  const c = "#5a4a3a";
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0.32, 0]} castShadow>
        <boxGeometry args={[0.9, 0.28, 0.9]} />
        <meshStandardMaterial color={c} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.78, 0.18, 0.78]} />
        <meshStandardMaterial color="#6b5a48" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.7, -0.4]}>
        <boxGeometry args={[0.9, 0.75, 0.16]} />
        <meshStandardMaterial color={c} roughness={0.9} />
      </mesh>
      <mesh position={[-0.44, 0.55, 0]}>
        <boxGeometry args={[0.16, 0.5, 0.9]} />
        <meshStandardMaterial color={c} roughness={0.9} />
      </mesh>
      <mesh position={[0.44, 0.55, 0]}>
        <boxGeometry args={[0.16, 0.5, 0.9]} />
        <meshStandardMaterial color={c} roughness={0.9} />
      </mesh>
    </group>
  );
}

// A stone fireplace for the back wall — surround + mantel + logs, with animated
// flickering flames and a warm firelight.
function Fireplace() {
  const zF = A + VEST_LEN - 0.32; // front face, just off the south wall
  const zBack = A + VEST_LEN - 0.06;
  const stone = "#6f665c";
  const stoneDark = "#524b43";
  const lightRef = useRef<THREE.PointLight>(null);
  const flameRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const flick =
      0.72 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.1 + Math.random() * 0.05;
    if (lightRef.current) lightRef.current.intensity = 7 * flick;
    if (flameRef.current) flameRef.current.scale.set(1, 0.85 + flick * 0.3, 1);
  });
  const flame = (x: number, s: number, color: string, y = 0) => (
    <mesh position={[x, y, 0]}>
      <coneGeometry args={[0.11 * s, 0.42 * s, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
    </mesh>
  );
  return (
    <group>
      {/* hearth */}
      <mesh position={[0, 0.08, zF - 0.02]}>
        <boxGeometry args={[2.0, 0.16, 0.62]} />
        <meshStandardMaterial color={stoneDark} roughness={0.9} />
      </mesh>
      {/* side pillars */}
      <mesh position={[-0.72, 1.0, zF]}>
        <boxGeometry args={[0.42, 1.9, 0.5]} />
        <meshStandardMaterial color={stone} roughness={0.9} />
      </mesh>
      <mesh position={[0.72, 1.0, zF]}>
        <boxGeometry args={[0.42, 1.9, 0.5]} />
        <meshStandardMaterial color={stone} roughness={0.9} />
      </mesh>
      {/* lintel above the opening */}
      <mesh position={[0, 1.62, zF]}>
        <boxGeometry args={[1.86, 0.66, 0.5]} />
        <meshStandardMaterial color={stone} roughness={0.9} />
      </mesh>
      {/* mantel shelf */}
      <mesh position={[0, 1.99, zF + 0.02]}>
        <boxGeometry args={[2.25, 0.14, 0.68]} />
        <meshStandardMaterial color={stoneDark} roughness={0.7} />
      </mesh>
      {/* dark firebox recess */}
      <mesh position={[0, 0.72, zBack]}>
        <boxGeometry args={[1.05, 1.15, 0.06]} />
        <meshStandardMaterial color="#130f0b" roughness={1} />
      </mesh>
      {/* logs */}
      <mesh position={[0, 0.26, zF + 0.06]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.82, 8]} />
        <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.35, zF + 0.02]} rotation={[0, 0, Math.PI / 2 + 0.12]}>
        <cylinderGeometry args={[0.055, 0.055, 0.72, 8]} />
        <meshStandardMaterial color="#2c1f14" roughness={0.9} />
      </mesh>
      {/* flames */}
      <group ref={flameRef} position={[0, 0.34, zF + 0.05]}>
        {flame(-0.16, 1.0, "#ff7a1a")}
        {flame(0.14, 0.85, "#ffa028", 0.02)}
        {flame(-0.01, 1.15, "#ffcb46", 0.05)}
      </group>
      <pointLight
        ref={lightRef}
        position={[0, 0.6, zF + 0.15]}
        intensity={7}
        distance={6.5}
        decay={2}
        color="#ff8a3a"
      />
    </group>
  );
}

function DenFurniture({ lowPower, lightsOn }: { lowPower: boolean; lightsOn: boolean }) {
  const wW = VEST_HALF; // wall x
  const zS = A + VEST_LEN; // south wall z
  const zMid = A + VEST_LEN / 2;
  return (
    <group>
      {/* room ceiling light (toggleable) */}
      {lightsOn && (
        <pointLight
          position={[0, H - 0.6, zMid]}
          intensity={lowPower ? 11 : 16}
          distance={24}
          decay={2}
          color="#ffe6bd"
        />
      )}

      {/* rug in the middle of the room */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, zMid]}>
        <planeGeometry args={[6.4, 5]} />
        <meshStandardMaterial color="#5b2f2c" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, zMid]}>
        <planeGeometry args={[7, 5.6]} />
        <meshStandardMaterial color="#3c2320" roughness={0.95} />
      </mesh>

      {/* bookshelves: two on the west wall, one on the east, one anchoring the
          back (south) wall under the sign */}
      <Bookshelf position={[-wW + 0.22, 0, zMid - 2.6]} rotation={[0, Math.PI / 2, 0]} />
      <Bookshelf position={[-wW + 0.22, 0, zMid + 0.3]} rotation={[0, Math.PI / 2, 0]} />
      <Bookshelf position={[wW - 0.22, 0, zMid - 2.6]} rotation={[0, -Math.PI / 2, 0]} />

      {/* fireplace centered on the back (south) wall */}
      <Fireplace />

      {/* writing desk in front of the east window, chair facing out the window */}
      <Desk position={[wW - 0.7, 0, zS - 3]} rotation={[0, -Math.PI / 2, 0]} />
      <Chair position={[wW - 1.75, 0, zS - 3]} rotation={[0, Math.PI / 2, 0]} />

      {/* reading nook: armchair, side table + lamp near the SW corner */}
      <Armchair position={[-2.8, 0, zS - 1.6]} rotation={[0, Math.PI - 0.35, 0]} />
      <mesh position={[-3.9, 0.3, zS - 2.6]}>
        <cylinderGeometry args={[0.28, 0.28, 0.6, 16]} />
        <meshStandardMaterial color={WOOD_DARK} roughness={0.6} />
      </mesh>
      {/* floor lamp */}
      <mesh position={[-4.4, 0.9, zS - 1.4]}>
        <cylinderGeometry args={[0.025, 0.025, 1.8, 8]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      <mesh position={[-4.4, 1.85, zS - 1.4]}>
        <coneGeometry args={[0.22, 0.3, 16, 1, true]} />
        <meshStandardMaterial color="#fff2cf" emissive="#ffd98f" emissiveIntensity={1.2} side={2} />
      </mesh>
      {lightsOn && !lowPower && (
        <pointLight
          position={[-4.4, 1.7, zS - 1.4]}
          intensity={6}
          distance={7}
          decay={2}
          color="#ffdca0"
        />
      )}
    </group>
  );
}

// Procedural daytime sky: a blue gradient with soft clouds. Seeded so each
// window/skylight gets its own cloud layout (they shouldn't match).
type SkyMood = "day" | "rain" | "snow";
function skyTexture(seed = 1, mood: SkyMood = "day"): THREE.Texture {
  // Offset the RNG stream per mood so rain/snow get their OWN cloud layouts
  // instead of the daytime clouds in a different color.
  const moodSeed = seed + (mood === "rain" ? 137 : mood === "snow" ? 613 : 0);
  let s = (moodSeed * 9301 + 49297) % 233280;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  if (mood === "rain") {
    // Moody dusk-blue storm sky (not flat gray) — the look Shawn preferred.
    grad.addColorStop(0, "#233a5c");
    grad.addColorStop(0.55, "#33507a");
    grad.addColorStop(1, "#4c6c99");
  } else if (mood === "snow") {
    // Soft silvery overcast, cool and pale.
    grad.addColorStop(0, "#7c8898");
    grad.addColorStop(0.55, "#98a3b1");
    grad.addColorStop(1, "#bcc4ce");
  } else {
    grad.addColorStop(0, "#5a8ed4");
    grad.addColorStop(0.55, "#93bde9");
    grad.addColorStop(1, "#cfe4f6");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const cloud =
    mood === "day" ? "255,255,255" : mood === "snow" ? "236,240,246" : "206,217,233";
  const cloudA = mood === "day" ? 0.92 : mood === "snow" ? 0.82 : 0.78;
  // Rain/snow clouds are lumpier and more irregular than the tidy day puffs.
  const lumps = mood === "day" ? 7 : 11;
  const spread = mood === "day" ? 1.7 : 2.3;
  const puff = (cx: number, cy: number, sz: number) => {
    for (let i = 0; i < lumps; i++) {
      const x = cx + (rnd() - 0.5) * sz * spread;
      const y = cy + (rnd() - 0.5) * sz * (mood === "day" ? 0.55 : 0.9);
      const r = sz * (mood === "day" ? 0.4 + rnd() * 0.55 : 0.28 + rnd() * 0.95);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${cloud},${cloudA * (0.7 + rnd() * 0.3)})`);
      g.addColorStop(1, `rgba(${cloud},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  // day: 3–4 scattered clouds; rain/snow: 5–7, heavier & more overcast
  const n = (mood === "day" ? 3 : 5) + Math.floor(rnd() * (mood === "day" ? 2 : 3));
  for (let i = 0; i < n; i++) {
    puff(20 + rnd() * 220, 30 + rnd() * 200, 18 + rnd() * (mood === "day" ? 16 : 26));
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Windows you can toggle between day, night, rain, and snow.
type Sky = "day" | "night" | "rain" | "snow";
const SKY_LOOK: Record<Sky, { sky: string; int: number; light: string; li: number }> = {
  day: { sky: "#a9cbf0", int: 1.0, light: "#dbe6ff", li: 9 },
  night: { sky: "#0e1830", int: 0.45, light: "#2b3a5c", li: 2.5 },
  rain: { sky: "#3a557d", int: 0.7, light: "#4a5f80", li: 4 },
  snow: { sky: "#98a3b1", int: 0.8, light: "#c3ccd8", li: 6 },
};

function RainStreaks({
  zW,
  xWall,
  dir,
  lowPower,
}: {
  zW: number;
  xWall: number;
  dir: number;
  lowPower: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const count = lowPower ? 34 : 70;
  const drops = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        y: 1.3 + Math.random() * 2.4,
        z: zW - 1.4 + Math.random() * 2.8,
        v: 2 + Math.random() * 1.8,
      })),
    [count, zW]
  );
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const d = drops[i];
      d.y -= d.v * dt;
      if (d.y < 1.3) d.y = 3.7;
      c.position.y = d.y;
    });
  });
  return (
    <group ref={ref}>
      {drops.map((d, i) => (
        <mesh key={i} position={[xWall + dir * 0.1, d.y, d.z]}>
          <boxGeometry args={[0.011, 0.3, 0.011]} />
          <meshStandardMaterial
            color="#c6d4e2"
            transparent
            opacity={0.82}
            emissive="#9db2c6"
            emissiveIntensity={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}

function SnowFall({
  zW,
  xWall,
  dir,
  lowPower,
}: {
  zW: number;
  xWall: number;
  dir: number;
  lowPower: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const count = lowPower ? 34 : 64;
  // Inset well inside the pane (which spans y 1.3–3.7, z ±1.5) and swaying
  // gently, so flakes never reach the frame edge where a grazing view would
  // catch them poking out of the recess.
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        y: 1.5 + Math.random() * 2.0,
        z: zW - 1.15 + Math.random() * 2.3,
        v: 0.35 + Math.random() * 0.35,
        ph: Math.random() * Math.PI * 2,
        sway: 0.05 + Math.random() * 0.08,
        s: 0.012 + Math.random() * 0.013,
      })),
    [count, zW]
  );
  // Flat, window-facing flakes sitting right on the glass plane — a flat quad
  // has no depth, so it can never poke through the frame at a grazing angle
  // (spheres did). Rotated to face the room like the sky pane.
  const faceRot: [number, number, number] = [0, dir * (Math.PI / 2), 0];
  useFrame((_, dt) => {
    t.current += dt;
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const f = flakes[i];
      f.y -= f.v * dt;
      if (f.y < 1.5) f.y = 3.5;
      c.position.y = f.y;
      c.position.z = f.z + Math.sin(t.current * 0.8 + f.ph) * f.sway;
    });
  });
  return (
    <group ref={ref}>
      {flakes.map((f, i) => (
        <mesh key={i} position={[xWall + dir * 0.063, f.y, f.z]} rotation={faceRot}>
          <circleGeometry args={[f.s, 10]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#eef3fb"
            emissiveIntensity={0.7}
            transparent
            opacity={0.96}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function Stars({ zW, xWall, dir }: { zW: number; xWall: number; dir: number }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 28 }, () => ({
        y: 1.5 + Math.random() * 2.0,
        z: zW - 1.35 + Math.random() * 2.7,
        s: 0.012 + Math.random() * 0.02,
      })),
    [zW]
  );
  return (
    <group>
      {stars.map((st, i) => (
        <mesh key={i} position={[xWall + dir * 0.07, st.y, st.z]}>
          <sphereGeometry args={[st.s, 6, 6]} />
          <meshStandardMaterial color="#fdfbf0" emissive="#fdfbf0" emissiveIntensity={1.6} />
        </mesh>
      ))}
    </group>
  );
}

function DenWindow({
  side,
  sky,
  lowPower,
}: {
  side: "W" | "E";
  sky: Sky;
  lowPower: boolean;
}) {
  const zW = A + VEST_LEN - 3;
  const xWall = side === "W" ? -VEST_HALF : VEST_HALF;
  const dir = side === "W" ? 1 : -1; // toward the room interior
  const faceRot: [number, number, number] = [0, dir * (Math.PI / 2), 0];
  const look = SKY_LOOK[sky];
  const seed = side === "W" ? 11 : 27;
  const dayTex = useMemo(() => skyTexture(seed, "day"), [seed]);
  const rainTex = useMemo(() => skyTexture(seed, "rain"), [seed]);
  const snowTex = useMemo(() => skyTexture(seed, "snow"), [seed]);
  const paneTex = sky === "rain" ? rainTex : sky === "snow" ? snowTex : dayTex;
  const frameCol = "#2e2117";
  const bar = (args: [number, number, number], pos: [number, number, number]) => (
    <mesh position={pos}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={frameCol} roughness={0.6} />
    </mesh>
  );
  return (
    <group>
      {/* sky pane */}
      <mesh position={[xWall + dir * 0.06, 2.5, zW]} rotation={faceRot}>
        <planeGeometry args={[3, 2.4]} />
        {sky === "night" ? (
          <meshStandardMaterial color={look.sky} emissive={look.sky} emissiveIntensity={look.int} />
        ) : (
          <meshStandardMaterial
            map={paneTex}
            emissiveMap={paneTex}
            emissive="#ffffff"
            emissiveIntensity={sky === "day" ? 0.45 : sky === "rain" ? 0.32 : 0.42}
          />
        )}
      </mesh>
      {sky === "night" && <Stars zW={zW} xWall={xWall} dir={dir} />}
      {sky === "rain" && <RainStreaks zW={zW} xWall={xWall} dir={dir} lowPower={lowPower} />}
      {sky === "snow" && <SnowFall zW={zW} xWall={xWall} dir={dir} lowPower={lowPower} />}
      {/* frame + muntins */}
      {bar([0.16, 0.14, 3.26], [xWall + dir * 0.12, 3.77, zW])}
      {bar([0.16, 0.14, 3.26], [xWall + dir * 0.12, 1.23, zW])}
      {bar([0.16, 2.4, 0.14], [xWall + dir * 0.12, 2.5, zW - 1.5])}
      {bar([0.16, 2.4, 0.14], [xWall + dir * 0.12, 2.5, zW + 1.5])}
      {bar([0.12, 2.4, 0.05], [xWall + dir * 0.12, 2.5, zW])}
      {bar([0.12, 0.05, 3], [xWall + dir * 0.12, 2.5, zW])}
      {/* On phones the ceiling light carries the room; skip the window lights to
          keep the point-light count down. */}
      {!lowPower && (
        <pointLight
          position={[xWall + dir * 1.4, 2.7, zW]}
          intensity={look.li}
          distance={10}
          decay={2}
          color={look.light}
        />
      )}
    </group>
  );
}

// The atrium skylight, sharing the day / night / rain state. Rain falls across
// it at an angle (seen from below); night shows stars through the glass.
// day catches the interior light (bright daylight pouring in). night/rain use a
// black diffuse so the atrium point-light can't burn a hotspot into the "sky",
// and go semi-transparent so the stars / rain sitting ABOVE the glass show
// through — never inside the room.
function SkyStars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 44 }, () => ({
        x: -2.6 + Math.random() * 5.2,
        z: -2.6 + Math.random() * 5.2,
        y: H - 0.06 - Math.random() * 0.03,
        s: 0.012 + Math.random() * 0.022,
      })),
    []
  );
  return (
    <group>
      {stars.map((st, i) => (
        <mesh key={i} position={[st.x, st.y, st.z]}>
          <sphereGeometry args={[st.s, 6, 6]} />
          <meshStandardMaterial color="#fdfbf0" emissive="#fdfbf0" emissiveIntensity={1.8} />
        </mesh>
      ))}
    </group>
  );
}

function SkyRain({ lowPower }: { lowPower: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const count = lowPower ? 30 : 60;
  const drops = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: -2.7 + Math.random() * 5.4,
        z: -2.7 + Math.random() * 5.4,
        y: H - 0.03 - Math.random() * 0.03,
        v: 0.45 + Math.random() * 0.35,
      })),
    [count]
  );
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const d = drops[i];
      d.y -= d.v * dt;
      d.x += d.v * 0.1 * dt; // slight angle across the glass
      if (d.y < H - 0.06) {
        d.y = H - 0.03;
        d.x = -2.7 + Math.random() * 5.4;
      }
      c.position.set(d.x, d.y, d.z);
    });
  });
  return (
    <group ref={ref}>
      {drops.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]} rotation={[0, 0, 0.3]}>
          <boxGeometry args={[0.01, 0.14, 0.01]} />
          <meshStandardMaterial
            color="#cdd9e6"
            transparent
            opacity={0.9}
            emissive="#b3c3d3"
            emissiveIntensity={0.95}
          />
        </mesh>
      ))}
    </group>
  );
}

function SkySnow({ lowPower }: { lowPower: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(0);
  const count = lowPower ? 28 : 54;
  const flakes = useMemo(
    () =>
      Array.from({ length: count }, () => ({
        x: -2.7 + Math.random() * 5.4,
        z: -2.7 + Math.random() * 5.4,
        y: H - 0.03 - Math.random() * 0.04,
        v: 0.16 + Math.random() * 0.16,
        ph: Math.random() * Math.PI * 2,
        s: 0.02 + Math.random() * 0.02,
      })),
    [count]
  );
  useFrame((_, dt) => {
    t.current += dt;
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const f = flakes[i];
      f.y -= f.v * dt;
      if (f.y < H - 0.08) {
        f.y = H - 0.03;
        f.x = -2.7 + Math.random() * 5.4;
      }
      c.position.set(f.x + Math.sin(t.current * 0.6 + f.ph) * 0.06, f.y, f.z);
    });
  });
  return (
    <group ref={ref}>
      {flakes.map((f, i) => (
        <mesh key={i} position={[f.x, f.y, f.z]}>
          <sphereGeometry args={[f.s, 6, 6]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#eef3fb"
            emissiveIntensity={0.85}
            transparent
            opacity={0.96}
          />
        </mesh>
      ))}
    </group>
  );
}

// A steel-and-glass skylight frame — a perimeter curb + a mullion grid — so the
// opening reads as glazing, not a hole in the roof.
function SkylightFrame() {
  const y = H - 0.15;
  const col = "#2b2118";
  const bar = (
    args: [number, number, number],
    pos: [number, number, number],
    key: string
  ) => (
    <mesh key={key} position={pos}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={col} roughness={0.55} metalness={0.25} />
    </mesh>
  );
  const lines = [-1.5, 0, 1.5];
  return (
    <group>
      {/* raised perimeter curb (sits a little proud of the ceiling) */}
      {bar([6.24, 0.22, 0.2], [0, y + 0.03, -3.02], "n")}
      {bar([6.24, 0.22, 0.2], [0, y + 0.03, 3.02], "s")}
      {bar([0.2, 0.22, 6.24], [-3.02, y + 0.03, 0], "w")}
      {bar([0.2, 0.22, 6.24], [3.02, y + 0.03, 0], "e")}
      {/* mullion grid */}
      {lines.map((x, i) => bar([0.09, 0.12, 6], [x, y, 0], `vx${i}`))}
      {lines.map((z, i) => bar([6, 0.12, 0.09], [0, y, z], `vz${i}`))}
    </group>
  );
}

function Skylight({ sky, lowPower }: { sky: Sky; lowPower: boolean }) {
  const dayTex = useMemo(() => skyTexture(41, "day"), []);
  const rainTex = useMemo(() => skyTexture(53, "rain"), []);
  const snowTex = useMemo(() => skyTexture(61, "snow"), []);
  return (
    <group>
      <SkylightFrame />
      {sky === "night" && <SkyStars />}
      {sky === "rain" && <SkyRain lowPower={lowPower} />}
      {sky === "snow" && <SkySnow lowPower={lowPower} />}
      {/* Self-lit sky: black diffuse + emissive texture, so the atrium ceiling
          light has no diffuse/specular to hotspot — the sky shows on its own. */}
      <mesh position={[0, H - 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 6]} />
        {sky === "day" ? (
          <meshLambertMaterial color="#000000" emissive="#ffffff" emissiveMap={dayTex} emissiveIntensity={1} />
        ) : sky === "rain" ? (
          // Dimmer than day so the overcast storm reads moody, not bright blue.
          <meshLambertMaterial color="#000000" emissive="#b7c4d6" emissiveMap={rainTex} emissiveIntensity={0.6} />
        ) : sky === "snow" ? (
          <meshLambertMaterial color="#000000" emissive="#d7dee7" emissiveMap={snowTex} emissiveIntensity={0.72} />
        ) : (
          <meshLambertMaterial color="#000000" emissive="#1e2f56" emissiveIntensity={1} />
        )}
      </mesh>
    </group>
  );
}

// Interactive stations in the Den. Standing near one shows a prompt that opens
// the matching 2D tool (the writing desk, the library / reader).
type SeatPose = { x: number; z: number; y: number; yaw: number };
type Station = {
  id: string;
  label: string;
  cx: number;
  cz: number;
  r: number;
  href: string;
  sit?: SeatPose; // if set, the player sits down here before the tool opens
};
const DEN_STATIONS: Station[] = [
  {
    id: "desk",
    label: "✍️  Sit and write",
    cx: VEST_HALF - 2.4,
    cz: A + VEST_LEN - 3,
    r: 1.9,
    href: "/den",
    // seated at the desk chair, lowered, facing the desk/east window
    sit: { x: VEST_HALF - 1.75, z: A + VEST_LEN - 3, y: 1.15, yaw: -Math.PI / 2 },
  },
  {
    id: "chair",
    label: "📖  Sit and read",
    cx: -2.8,
    cz: A + VEST_LEN - 1.6,
    r: 1.9,
    href: "/den",
    // sunk into the armchair, facing into the room
    sit: { x: -2.8, z: A + VEST_LEN - 1.6, y: 1.05, yaw: -0.48 },
  },
  {
    id: "shelves",
    label: "📚  Browse your library",
    cx: -(VEST_HALF - 1),
    cz: A + VEST_LEN / 2,
    r: 2.4,
    href: "/den",
  },
];

function StationWatcher({
  posRef,
  onNear,
}: {
  posRef: React.MutableRefObject<{ x: number; z: number }>;
  onNear: (id: string | null) => void;
}) {
  const cur = useRef<string | null>(null);
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.2) return; // 5×/sec is plenty for a proximity prompt
    acc.current = 0;
    const p = posRef.current;
    let found: string | null = null;
    for (const s of DEN_STATIONS) {
      const dx = p.x - s.cx;
      const dz = p.z - s.cz;
      if (dx * dx + dz * dz < s.r * s.r) {
        found = s.id;
        break;
      }
    }
    if (found !== cur.current) {
      cur.current = found;
      onNear(found);
    }
  });
  return null;
}

function Scene({
  layout,
  previews,
  placements,
  editing,
  onPick,
  onNudgeSelect,
  onSelectPlacement,
  galleryVersion,
  hot,
  reflect,
  lowPower,
  showDen,
  sky,
  lightsOn,
  denName,
  onSelect,
}: {
  layout: Layout;
  previews: Record<string, GalleryPiece | null>;
  placements: WallPlacement[];
  editing: boolean;
  onPick: (slotKey: string) => void;
  onNudgeSelect: (slotKey: string) => void;
  onSelectPlacement: (pl: WallPlacement) => void;
  galleryVersion: number;
  hot: string[];
  reflect: boolean;
  lowPower: boolean;
  showDen: boolean;
  sky: Sky;
  lightsOn: boolean;
  denName: string;
  onSelect: (p: Piece) => void;
}) {
  const anchorMap = useMemo(
    () => new Map(layout.wallAnchors.map((a) => [a.slotKey, a] as const)),
    [layout.wallAnchors]
  );
  return (
    <>
      {/* Sky-vs-floor gradient (cool top, warm bounce) replaces flat ambient */}
      <hemisphereLight args={["#e9ecf2", "#bdb4a6", lowPower ? 0.78 : 0.55]} />
      {/* Key + cool fill to model form */}
      <directionalLight position={[0, 12, 8]} intensity={2.2} color="#fff3e0" />
      <directionalLight position={[-8, 10, -6]} intensity={0.6} color="#dfe6f0" />
      {/* Per-room warmth: atrium neutral & bright, galleries warm. On phones we
          cap the point-light count (ambient is lifted to compensate). */}
      {(lowPower ? layout.lights.slice(0, 6) : layout.lights).map(([x, z], i) => (
        <pointLight
          key={i}
          position={[x, H - 0.6, z]}
          intensity={i === 0 ? 18 : 14}
          distance={i === 0 ? 44 : 26}
          decay={2}
          color={i === 0 ? "#fff4e4" : "#ffe6bd"}
        />
      ))}
      {/* Atrium skylight — shares the owner's day/night/rain state */}
      <Skylight sky={sky} lowPower={lowPower} />

      {/* Inlaid floor medallion anchoring the big atrium floor */}
      <group position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[2.9, 3.12, 72]} />
          <meshStandardMaterial color="#b39c76" roughness={0.5} />
        </mesh>
        {Array.from({ length: 8 }).map((_, i) => {
          const ang = (i * Math.PI) / 4;
          return (
            <mesh key={i} position={[Math.cos(ang) * 2.15, Math.sin(ang) * 2.15, 0.001]} rotation={[0, 0, ang]}>
              <planeGeometry args={[1.1, 0.09]} />
              <meshStandardMaterial color="#b39c76" roughness={0.5} />
            </mesh>
          );
        })}
        <mesh position={[0, 0, 0.001]}>
          <ringGeometry args={[1.35, 1.5, 72]} />
          <meshStandardMaterial color="#cdb98f" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.002]}>
          <ringGeometry args={[0.86, 1.0, 48]} />
          <meshStandardMaterial color="#cdb98f" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0, 0.001]}>
          <circleGeometry args={[0.86, 48]} />
          <meshStandardMaterial color="#4c3420" roughness={0.6} />
        </mesh>
      </group>

      {/* "<Curator>'s Den" over the Den doorway, facing the museum — the Den's
          entrance sign, mirroring the museum name. Owner-only. */}
      {showDen && denName && (
        <Text
          font={MUSEUM_FONT}
          position={[0, DOORH + 0.5, A - 0.06]}
          rotation={[0, Math.PI, 0]}
          fontSize={0.34}
          color="#2a2320"
          anchorX="center"
          anchorY="middle"
          maxWidth={6}
          textAlign="center"
          letterSpacing={0.04}
        >
          {denName}
        </Text>
      )}
      {/* Polished atrium floor — one reflection pass, desktop only */}
      {reflect && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <planeGeometry args={[A * 2 - 0.4, A * 2 - 0.4]} />
          <MeshReflectorMaterial
            resolution={256}
            mixBlur={6}
            mixStrength={0.35}
            blur={[150, 60]}
            minDepthThreshold={0.9}
            maxDepthThreshold={1.1}
            depthScale={1}
            roughness={0.85}
            color="#5c3f28"
            metalness={0}
          />
        </mesh>
      )}

      {layout.rooms.map((room, i) => (
        <RoomMesh key={i} room={room} />
      ))}

      {showDen && <DenFurniture lowPower={lowPower} lightsOn={lightsOn} />}
      {showDen && <DenWindow side="W" sky={sky} lowPower={lowPower} />}
      {showDen && <DenWindow side="E" sky={sky} lowPower={lowPower} />}

      {layout.hints.map((h, i) => (
        <HintSign key={i} pos={h.pos} rot={h.rot} />
      ))}

      {layout.labels.map((l, i) => (
        <Text
          key={i}
          font={MUSEUM_FONT}
          position={l.pos}
          rotation={l.rot}
          fontSize={l.size}
          color="#2a2320"
          anchorX="center"
          anchorY="middle"
          maxWidth={6}
          textAlign="center"
          letterSpacing={0.04}
        >
          {l.text}
        </Text>
      ))}

      {layout.galleries.map((g) =>
        hot.includes(g.slug) ? (
          <GalleryFull key={`${g.slug}:${galleryVersion}`} gallery={g} onSelect={onSelect} />
        ) : null
      )}

      {placements.map((pl) => {
        const a = anchorMap.get(pl.slotKey);
        if (!a || !pl.piece.image) return null;
        return (
          <ProxyArtwork
            key={pl.slotKey}
            piece={pl.piece}
            position={pl.pos ?? a.position}
            rotation={a.rotation}
            onSelect={editing ? () => onNudgeSelect(pl.slotKey) : () => onSelectPlacement(pl)}
          />
        );
      })}

      {editing &&
        layout.wallAnchors
          .filter((a) => !placements.some((p) => p.slotKey === a.slotKey))
          .map((a) => <Hotspot key={a.slotKey} anchor={a} onPick={onPick} />)}
    </>
  );
}

function Directory({ nav, onPick, onHome }: { nav: Nav[]; onPick: (i: number) => void; onHome: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "absolute", top: 14, right: 14, textAlign: "right" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={dirBtnStyle}
        data-tour="directory"
      >
        Directory {open ? "▴" : "▾"}
      </button>
      {open && (
        <div style={dirPanelStyle}>
          <button onClick={onHome} style={{ ...dirItemStyle, color: "#d8bd85" }}>
            ⌂ Entrance
          </button>
          {nav.map((n, i) => (
            <button key={i} onClick={() => onPick(i)} style={dirItemStyle}>
              <span style={{ color: "#a8a09a", fontSize: 11 }}>{n.wing}</span>
              <span>{n.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ENTRANCE_SPAWN: [number, number, number] = [0, EYE_Y, A + VEST_LEN - 2];

export default function Museum3D({
  handle,
  isOwner = false,
}: {
  handle?: string;
  isOwner?: boolean;
} = {}) {
  const [museum, setMuseum] = useState<Museum | null>(null);
  const [placements, setPlacements] = useState<WallPlacement[]>([]);
  // In-museum editor (owner only). editing toggles the edit HUD; the 3D hotspots
  // and art picker are added in the next (supervised) pass.
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  // When set, the picker adds the chosen piece to this gallery's COLLECTION
  // (which syncs to the 2D gallery and auto-hangs in 3D) rather than free-placing.
  const [collectionTarget, setCollectionTarget] = useState<{ id: string; name: string } | null>(
    null
  );
  // The wall placement currently selected for nudging (edit mode).
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);
  // Bumped after a collection changes so mounted gallery rooms re-fetch + re-hang.
  const [galleryVersion, setGalleryVersion] = useState(0);

  // Group placed wall pieces by location so the edit panel reads as sections
  // (Main Room / North·West·East Gallery / a gallery's own walls) not one list.
  const galleryNameBySlug = useMemo(() => {
    const m = new Map<string, string>();
    museum?.wings.forEach((w) => w.collections.forEach((c) => m.set(c.slug, c.name)));
    return m;
  }, [museum]);
  const groupedPlacements = useMemo(() => {
    const label = (slotKey: string): string => {
      const [zone, a] = slotKey.split(":");
      if (zone === "atrium") return "Main Room";
      if (zone === "wing")
        return a === "N"
          ? "North Gallery"
          : a === "W"
          ? "West Gallery"
          : a === "E"
          ? "East Gallery"
          : "Wing";
      if (zone === "gallery") return galleryNameBySlug.get(a) ?? "Gallery walls";
      return "Other";
    };
    const m = new Map<string, WallPlacement[]>();
    for (const pl of placements) {
      const g = label(pl.slotKey);
      (m.get(g) ?? m.set(g, []).get(g)!).push(pl);
    }
    return Array.from(m.entries());
  }, [placements, galleryNameBySlug]);

  // Visitor mode = the curated museum (what everyone sees). Curator mode =
  // editing: the whole museum opens up and the placement tools appear.
  function setMode(curator: boolean) {
    setEditing(curator);
    if (!curator) {
      setSelectedPlacement(null);
      setEditTarget(null);
      setCollectionTarget(null);
    }
  }

  // Optimistically clear a slot, then tell the server (RLS enforces ownership).
  async function removePlacement(slotKey: string) {
    setPlacements((ps) => ps.filter((p) => p.slotKey !== slotKey));
    try {
      await fetch(`/api/museum-placements?slotKey=${encodeURIComponent(slotKey)}`, {
        method: "DELETE",
      });
    } catch {
      /* best-effort; a reload reconciles */
    }
  }

  function resolveHandle(): string | null {
    return (
      handle ??
      (typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("u")
        : null)
    );
  }

  // Refetch the museum so a newly created/curated gallery appears + auto-hangs.
  async function reloadMuseum() {
    const h = resolveHandle();
    if (!h) return;
    try {
      const d = await fetch(`/api/museum?u=${encodeURIComponent(h)}`).then((r) => r.json());
      const m = d.museum as Museum | null;
      if (m && Array.isArray(m.wings)) setMuseum(m);
    } catch {
      /* keep current */
    }
  }

  // Create + publish a gallery from inside the museum, then open the picker to
  // add its first piece (an empty gallery wouldn't render until it has art).
  async function createGallery() {
    const name = window.prompt("Name your new gallery")?.trim();
    if (!name) return;
    try {
      const c = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => r.json());
      if (!c?.id) return;
      await fetch(`/api/collections/${c.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public: true }),
      });
      setCollectionTarget({ id: c.id, name });
    } catch {
      /* ignore; nothing created client-side to roll back */
    }
  }

  // Add the chosen piece to a gallery's collection, then rebuild the museum.
  async function addToCollection(
    collectionId: string,
    art: { source: string; externalId: string }
  ) {
    setCollectionTarget(null);
    try {
      await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          museum: art.source,
          objectId: art.externalId,
          collectionId,
        }),
      });
      pieceCache.clear();
      await reloadMuseum();
      setGalleryVersion((v) => v + 1);
    } catch {
      /* best-effort */
    }
  }

  // Nudge a selected placement along its wall (dAlong) or in height (dY), then
  // persist. Rotation is fixed by the wall; only position moves. The wall axis
  // comes from the slotKey's side (N/S walls run along X, E/W along Z).
  function nudgePlacement(slotKey: string, dAlong: number, dY: number) {
    const anchor = layout?.wallAnchors.find((a) => a.slotKey === slotKey);
    const pl = placements.find((p) => p.slotKey === slotKey);
    if (!anchor || !pl) return;
    const side = slotKey.split(":").at(-2);
    // "Right" from the viewer facing the wall is +world-axis on the N/E walls but
    // -world-axis on the S/W walls (you're facing the opposite way), so flip there.
    const sign = side === "S" || side === "W" ? -1 : 1;
    const base = pl.pos ?? anchor.position;
    const np: [number, number, number] = [base[0], base[1], base[2]];
    // Clamp along the wall (can't slide off into the room) and in height.
    np[anchor.axis] = Math.max(anchor.lo, Math.min(anchor.hi, base[anchor.axis] + dAlong * sign));
    np[1] = Math.max(0.8, Math.min(H - 0.8, base[1] + dY));
    setPlacements((ps) => ps.map((p) => (p.slotKey === slotKey ? { ...p, pos: np } : p)));
    fetch("/api/museum-placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotKey,
        source: pl.source,
        externalId: pl.externalId,
        title: pl.piece.title,
        imageUrl: pl.piece.image,
        posX: np[0],
        posY: np[1],
        posZ: np[2],
      }),
    }).catch(() => {});
  }

  // Open the full info placard for a placed piece. Placements only store title +
  // image, so we enrich from the full artwork record (covers older placements too).
  async function openPlacementInfo(pl: WallPlacement) {
    setSelected({ title: pl.piece.title, image: pl.piece.image, museum: pl.piece.museum });
    try {
      const d = await fetch(
        `/api/artwork?museum=${encodeURIComponent(pl.source)}&objectId=${encodeURIComponent(
          pl.externalId
        )}`
      ).then((r) => r.json());
      const a = d.artwork;
      if (a)
        setSelected({
          title: a.title || pl.piece.title,
          artist: a.artist || undefined,
          dateText: a.dateText || undefined,
          culture: a.culture || undefined,
          medium: a.medium || undefined,
          description: a.description || undefined,
          museum: pl.piece.museum,
          sourceUrl: a.sourceUrl || undefined,
          image: a.image || pl.piece.image,
        });
    } catch {
      /* keep the basic card */
    }
  }

  // Place (or replace) a piece at a slot: optimistic render, then POST.
  async function savePlacement(
    slotKey: string,
    art: { source: string; externalId: string; title: string; image: string }
  ) {
    setPlacements((ps) => [
      ...ps.filter((p) => p.slotKey !== slotKey),
      {
        slotKind: "wall",
        slotKey,
        source: art.source,
        externalId: art.externalId,
        rotationY: 0,
        mount: "pedestal",
        piece: { title: art.title, image: art.image, museum: art.source },
      },
    ]);
    setEditTarget(null);
    try {
      await fetch("/api/museum-placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotKey,
          source: art.source,
          externalId: art.externalId,
          title: art.title,
          imageUrl: art.image,
        }),
      });
    } catch {
      /* best-effort; a reload reconciles */
    }
  }
  const [view, setView] = useState<"loading" | "ready" | "empty">("loading");
  const [previews, setPreviews] = useState<Record<string, GalleryPiece | null>>({});
  const [selected, setSelected] = useState<Piece | null>(null);
  const [isTouch] = useState(
    () =>
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );
  // ?lite drops the heaviest GPU work (mirror floor + pixel ratio capped to 1)
  // for weak GPUs / Retina displays that lose the WebGL context under full load.
  const [lite] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("lite")
  );
  // Controls panel starts collapsed on phones (where it crowds the view).
  const [infoOpen, setInfoOpen] = useState(
    () =>
      !(
        typeof window !== "undefined" &&
        ("ontouchstart" in window || navigator.maxTouchPoints > 0)
      )
  );
  const [hot, setHot] = useState<string[]>([]);
  const [nearStation, setNearStation] = useState<string | null>(null);
  const [denPanel, setDenPanel] = useState<null | "library" | "writing">(null);
  const [sky, setSky] = useState<Sky>("day");
  const [lightsOn, setLightsOn] = useState(true);
  const [rainSound, setRainSound] = useState(true);

  // Sit-down animation state (walk to a chair → the camera sinks into the seat,
  // then the tool opens; standing back up on close).
  const sitRef = useRef<{ x: number; z: number; y: number; yaw: number } | null>(null);
  const sitPhase = useRef<"none" | "sitting" | "seated" | "standing">("none");
  const seatPose = useRef<{ x: number; z: number; y: number; yaw: number } | null>(null);
  const pendingTab = useRef<"library" | "writing">("library");
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const onSeated = useCallback(() => {
    if (sitPhase.current === "sitting") {
      sitPhase.current = "seated";
      setDenPanel(pendingTab.current);
    } else if (sitPhase.current === "standing") {
      sitPhase.current = "none";
      sitRef.current = null;
      forceRender();
    }
  }, []);

  const pausedRef = useRef(false);
  pausedRef.current = denPanel !== null || sitPhase.current !== "none";

  // Rain ambience via a plain looping <audio> element. We originally used Web
  // Audio for a seamless loop, but iOS re-suspends a Web Audio context that
  // isn't backed by an active media element — so the rain would play for a
  // second and die unless music (a persistent <audio>) was also running. A
  // dedicated <audio loop> element holds the audio session open itself and can
  // never be suspended out from under us. (The faint loop seam is inaudible in
  // rain noise.)
  const rainAudioRef = useRef<HTMLAudioElement | null>(null);

  // iOS blocks the first-ever media play unless it happens inside a user
  // gesture. The rain's play() fires from an effect (not synchronously in the
  // tap), so on the first tap we play a silent <audio> element — an
  // HTMLMediaElement play in a gesture unlocks the audio session globally, so
  // the rain element can then play from anywhere.
  useEffect(() => {
    const sampleRate = 8000;
    const dataSize = Math.floor(sampleRate * 0.05) * 2;
    const ab = new ArrayBuffer(44 + dataSize);
    const dv = new DataView(ab);
    const str = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
    };
    str(0, "RIFF");
    dv.setUint32(4, 36 + dataSize, true);
    str(8, "WAVE");
    str(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sampleRate, true);
    dv.setUint32(28, sampleRate * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    str(36, "data");
    dv.setUint32(40, dataSize, true);
    const url = URL.createObjectURL(new Blob([ab], { type: "audio/wav" }));
    let done = false;
    const unlock = () => {
      if (done) return;
      done = true;
      try {
        const a = new Audio(url);
        a.volume = 0;
        a.play().catch(() => {});
      } catch {
        /* ignore */
      }
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    let a = rainAudioRef.current;
    if (sky === "rain" && rainSound) {
      if (!a) {
        a = new Audio("/rain.mp3");
        a.loop = true;
        a.volume = 0.4;
        a.preload = "auto";
        rainAudioRef.current = a;
      }
      a.play().catch(() => {
        /* iOS may block until a gesture unlocks audio; the next toggle retries */
      });
    } else if (a) {
      a.pause();
    }
  }, [sky, rainSound]);

  useEffect(
    () => () => {
      const a = rainAudioRef.current;
      if (a) {
        a.pause();
        a.src = "";
        rainAudioRef.current = null;
      }
    },
    []
  );
  const [tp, setTp] = useState<{ spawn: [number, number, number]; yaw: number; k: number }>({
    spawn: ENTRANCE_SPAWN,
    yaw: 0,
    k: 0,
  });
  const dragRef = useRef(false);
  const joyRef = useRef({ x: 0, y: 0 });
  const posRef = useRef({ x: ENTRANCE_SPAWN[0], z: ENTRANCE_SPAWN[2] });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [musicOn, setMusicOn] = useState(false);
  const [trackIdx, setTrackIdx] = useState(0);
  const [musicMenu, setMusicMenu] = useState(false);
  const toggleMusic = () => {
    const a = audioRef.current;
    if (!a) return;
    if (musicOn) {
      a.pause();
      setMusicOn(false);
    } else {
      a.volume = 0.32;
      a.play().then(() => setMusicOn(true)).catch(() => {});
    }
  };
  // Pick a track from the menu — it starts playing (and loops).
  const pickTrack = (i: number) => {
    setMusicMenu(false);
    setMusicOn(true);
    if (i === trackIdx) {
      const a = audioRef.current;
      if (a) {
        a.volume = 0.32;
        a.play().catch(() => {});
      }
    } else {
      setTrackIdx(i); // the effect below plays the new track
    }
  };
  // When the track changes while playing, start the new one.
  useEffect(() => {
    const a = audioRef.current;
    if (a && musicOn) {
      a.volume = 0.32;
      a.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIdx]);

  const layout = useMemo(
    () => (museum ? buildMuseum(museum, editing) : null),
    [museum, editing]
  );
  const constrain: Constrain = useMemo(() => {
    if (!layout) return (nx, nz) => ({ x: nx, z: nz });
    const walk = layout.walk;
    const ok = (x: number, z: number) =>
      walk.some((a) => x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1);
    return (nx, nz, px, pz) => {
      if (ok(nx, nz)) return { x: nx, z: nz };
      if (ok(nx, pz)) return { x: nx, z: pz };
      if (ok(px, nz)) return { x: px, z: nz };
      return { x: px, z: pz };
    };
  }, [layout]);

  useEffect(() => {
    const h = handle ?? new URLSearchParams(window.location.search).get("u");
    if (!h) {
      setView("empty");
      return;
    }
    fetch(`/api/museum?u=${encodeURIComponent(h)}`)
      .then((r) => r.json())
      .then((d) => {
        const m = d.museum as Museum | null;
        // The owner can always walk in — even an empty museum (just the atrium) —
        // so they can create galleries and place art from inside. Visitors only
        // enter once there's at least one public gallery.
        if (m && Array.isArray(m.wings) && (m.wings.length > 0 || isOwner)) {
          setMuseum(m);
          setView("ready");
        } else {
          setView("empty");
        }
      })
      .catch(() => setView("empty"));

    // Free-standing wall placements (paintings hung outside the galleries).
    fetch(`/api/museum-placements?u=${encodeURIComponent(h)}`)
      .then((r) => r.json())
      .then((d) => setPlacements((d.placements as WallPlacement[]) ?? []))
      .catch(() => {});
  }, [handle, isOwner]);

  // Load one preview piece per gallery room.
  useEffect(() => {
    if (!layout) return;
    let cancelled = false;
    const slugs = Array.from(new Set(layout.galleries.map((g) => g.slug)));
    slugs.forEach((slug) => {
      fetch(`/api/gallery-pieces?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .then((pd) => {
          if (cancelled) return;
          setPreviews((p) => ({ ...p, [slug]: (pd.pieces?.[0] as GalleryPiece) ?? null }));
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [layout]);

  const station = DEN_STATIONS.find((s) => s.id === nearStation) ?? null;
  const enterStation = () => {
    if (!station || denPanel || sitPhase.current !== "none") return;
    const tab = station.id === "desk" ? "writing" : "library";
    pendingTab.current = tab;
    if (station.sit) {
      // Sit down first; onSeated opens the tool once we've settled in.
      seatPose.current = station.sit;
      sitRef.current = station.sit;
      sitPhase.current = "sitting";
      forceRender();
    } else {
      seatPose.current = null; // shelves: browse standing, no sit
      setDenPanel(tab);
    }
  };

  // Press E / Enter to use a nearby station.
  useEffect(() => {
    if (!station || denPanel) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "e" || e.key === "E" || e.key === "Enter") {
        e.preventDefault();
        enterStation();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station, denPanel]);

  // Closing the tool: stand back up if we were seated, then release control.
  const closeDenPanel = () => {
    setDenPanel(null);
    if (seatPose.current) {
      sitRef.current = { ...seatPose.current, y: EYE_Y };
      sitPhase.current = "standing";
      forceRender();
    }
  };

  const handleSelect = (p: Piece) => {
    if (!dragRef.current) setSelected(p);
  };
  const teleport = (spawn: [number, number, number], yaw: number) => {
    // Update the tracked position immediately so the streamer loads the
    // destination gallery before the remounted Player starts reporting.
    posRef.current = { x: spawn[0], z: spawn[2] };
    setTp((t) => ({ spawn, yaw, k: t.k + 1 }));
  };

  // Weather + light controls, rendered bottom-left on desktop but grouped into
  // the bottom-right control column on phones.
  const weatherButtons = (
    <>
      {(["day", "night", "rain", "snow"] as Sky[]).map((s) => (
        <button
          key={s}
          onClick={() => setSky(s)}
          style={{ ...skyBtnStyle, ...(sky === s ? skyBtnActiveStyle : null) }}
          aria-label={s}
        >
          {s === "day" ? "☀️" : s === "night" ? "🌙" : s === "rain" ? "🌧" : "❄️"}
        </button>
      ))}
      {sky === "rain" && (
        <button
          onClick={() => setRainSound((v) => !v)}
          style={{ ...skyBtnStyle, ...(rainSound ? skyBtnActiveStyle : null) }}
          aria-label="Toggle rain sound"
          title={rainSound ? "Rain sound on" : "Rain sound off"}
        >
          {rainSound ? "🔊" : "🔇"}
        </button>
      )}
      <span style={{ width: 1, background: "#4a423b", margin: "2px 2px" }} />
      <button
        onClick={() => setLightsOn((v) => !v)}
        style={{ ...skyBtnStyle, ...(lightsOn ? skyBtnActiveStyle : null) }}
        aria-label="Toggle lights"
        title={lightsOn ? "Lights on" : "Lights off"}
      >
        💡
      </button>
    </>
  );

  return (
    <div
      className="museum-viewport"
      style={{
        position: "relative",
        width: "100%",
        touchAction: "none",
        background: "#eceae4",
      }}
    >
      <Canvas
        camera={{ fov: 52, position: tp.spawn }}
        gl={{ toneMappingExposure: 1.08, powerPreference: "high-performance" }}
        dpr={isTouch || lite ? 1 : [1, 2]}
      >
        <color attach="background" args={["#eceae4"]} />
        <fogExp2 attach="fog" args={["#e6e3dc", 0.014]} />
        {layout && (
          <Scene
            layout={layout}
            previews={previews}
            placements={placements}
            editing={editing}
            onPick={(k) => {
              if (!dragRef.current) setEditTarget(k);
            }}
            onNudgeSelect={(k) => {
              if (!dragRef.current) setSelectedPlacement(k);
            }}
            onSelectPlacement={(pl) => {
              if (!dragRef.current) openPlacementInfo(pl);
            }}
            galleryVersion={galleryVersion}
            hot={hot}
            reflect={!isTouch && !lite}
            lowPower={isTouch}
            showDen={isOwner}
            sky={sky}
            lightsOn={lightsOn}
            denName={
              museum
                ? `${(museum.curator || museum.handle || "").trim()}'s Library`.replace(
                    /^'s Library$/,
                    "The Library"
                  )
                : ""
            }
            onSelect={handleSelect}
          />
        )}
        {layout && (
          <Streamer
            galleries={layout.galleries}
            posRef={posRef}
            cap={isTouch ? 1 : 2}
            onChange={setHot}
          />
        )}
        {layout && isOwner && (
          <StationWatcher posRef={posRef} onNear={setNearStation} />
        )}
        {layout && (
          <Player
            key={tp.k}
            dragRef={dragRef}
            joyRef={joyRef}
            spawn={tp.spawn}
            spawnYaw={tp.yaw}
            constrain={constrain}
            posRef={posRef}
            pausedRef={pausedRef}
            sitRef={sitRef}
            onSeated={onSeated}
          />
        )}
      </Canvas>

      {isOwner && denPanel && (
        <DenPanel initialTab={denPanel} onClose={closeDenPanel} />
      )}

      {isTouch && view === "ready" && <JoystickPad joyRef={joyRef} />}

      {isOwner && view === "ready" && (
        <div
          style={{
            position: "absolute",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 22,
          }}
        >
          <select
            value={editing ? "curator" : "visitor"}
            onChange={(e) => setMode(e.target.value === "curator")}
            aria-label="Museum mode"
            style={{
              background: editing ? "#e6d3a3" : "rgba(20,17,13,0.92)",
              color: editing ? "#14110d" : "#e6d3a3",
              border: `1px solid ${editing ? "#e6d3a3" : "#4a4030"}`,
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <option value="visitor">Visitor mode</option>
            <option value="curator">Curator mode</option>
          </select>
        </div>
      )}

      {isOwner && editing && (editTarget || collectionTarget) && view === "ready" && (
        <ArtPicker
          title={collectionTarget ? `Add to ${collectionTarget.name}` : undefined}
          placeLabel={collectionTarget ? `Add to ${collectionTarget.name}` : undefined}
          onClose={() => {
            setEditTarget(null);
            setCollectionTarget(null);
          }}
          onPlace={(art) =>
            collectionTarget
              ? addToCollection(collectionTarget.id, art)
              : savePlacement(editTarget as string, art)
          }
        />
      )}

      {isOwner &&
        editing &&
        selectedPlacement &&
        !editTarget &&
        !collectionTarget &&
        view === "ready" &&
        (() => {
          const pl = placements.find((p) => p.slotKey === selectedPlacement);
          if (!pl) return null;
          const nbtn = {
            width: 34,
            height: 30,
            borderRadius: 6,
            border: "1px solid #6b6157",
            background: "transparent",
            color: "#e6d3a3",
            cursor: "pointer",
            fontSize: 15,
          } as const;
          return (
            <div
              style={{
                position: "absolute",
                bottom: 96,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(20,17,13,0.95)",
                border: "1px solid #4a4030",
                borderRadius: 10,
                padding: "10px 14px",
                color: "#ece0c8",
                zIndex: 25,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Move &ldquo;{pl.piece.title}&rdquo;
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 34px)", gap: 4, justifyItems: "center" }}>
                <span />
                <button style={nbtn} onClick={() => nudgePlacement(selectedPlacement, 0, 0.2)} aria-label="Up">↑</button>
                <span />
                <button style={nbtn} onClick={() => nudgePlacement(selectedPlacement, -0.3, 0)} aria-label="Left">←</button>
                <button style={nbtn} onClick={() => nudgePlacement(selectedPlacement, 0, -0.2)} aria-label="Down">↓</button>
                <button style={nbtn} onClick={() => nudgePlacement(selectedPlacement, 0.3, 0)} aria-label="Right">→</button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    const k = pl.slotKey;
                    setSelectedPlacement(null);
                    removePlacement(k); // clears the slot + its collection membership
                    setEditTarget(k); // reopen the picker on the same slot
                  }}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #c8a15a", background: "transparent", color: "#e6d3a3", cursor: "pointer" }}
                >
                  Replace
                </button>
                <button
                  onClick={() => {
                    removePlacement(selectedPlacement);
                    setSelectedPlacement(null);
                  }}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #6b4a4a", background: "transparent", color: "#e0a0a0", cursor: "pointer" }}
                >
                  Remove
                </button>
                <button
                  onClick={() => setSelectedPlacement(null)}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #6b6157", background: "transparent", color: "#ece0c8", cursor: "pointer" }}
                >
                  Done
                </button>
              </div>
            </div>
          );
        })()}

      {isOwner && editing && !editTarget && !collectionTarget && view === "ready" && (
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 14,
            width: 260,
            maxHeight: "60vh",
            overflowY: "auto",
            background: "rgba(20,17,13,0.94)",
            border: "1px solid #4a4030",
            borderRadius: 10,
            padding: 12,
            color: "#ece0c8",
            zIndex: 20,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Editing your museum</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
            Walk up to a wall and click a ＋ to hang art. Remove pieces you&rsquo;ve
            hung below.
          </div>
          <button
            onClick={createGallery}
            style={{
              width: "100%",
              marginBottom: 10,
              padding: "7px 0",
              borderRadius: 6,
              border: "1px solid #c8a15a",
              background: "rgba(200,161,90,0.12)",
              color: "#e6d3a3",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ＋ New gallery
          </button>

          {(museum?.wings.flatMap((w) => w.collections) ?? []).length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                Add art to a gallery
              </div>
              {(museum?.wings.flatMap((w) => w.collections) ?? []).map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.name}
                  >
                    {c.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span
                      style={{
                        fontSize: 11,
                        color: c.count >= GALLERY_CAP ? "#c8a15a" : "#8a8175",
                      }}
                    >
                      {Math.min(c.count, GALLERY_CAP)}/{GALLERY_CAP}
                    </span>
                    <button
                      onClick={() => setCollectionTarget({ id: c.id, name: c.name })}
                      disabled={c.count >= GALLERY_CAP}
                      style={{
                        fontSize: 12,
                        padding: "3px 12px",
                        borderRadius: 6,
                        border: "1px solid #6b6157",
                        background: "transparent",
                        color: c.count >= GALLERY_CAP ? "#6b6157" : "#e6d3a3",
                        cursor: c.count >= GALLERY_CAP ? "default" : "pointer",
                      }}
                    >
                      {c.count >= GALLERY_CAP ? "Full" : "Add"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {placements.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.6 }}>No wall pieces placed yet.</div>
          ) : (
            groupedPlacements.map(([group, items]) => (
              <div key={group} style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, color: "#c8a15a", marginBottom: 2 }}>
                  {group} · {items.length}
                </div>
                {items.map((pl) => (
                  <div
                    key={pl.slotKey}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "5px 0",
                      borderTop: "0.5px solid #332c22",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={pl.piece.title}
                    >
                      {pl.piece.title}
                    </span>
                    <button
                      onClick={() => removePlacement(pl.slotKey)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        padding: "3px 8px",
                        borderRadius: 6,
                        border: "1px solid #6b4a4a",
                        background: "transparent",
                        color: "#e0a0a0",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {view === "ready" && (
        <Tour
          storageKey="mooseium-tour-3d"
          autoStart
          steps={MUSEUM_TOUR_STEPS}
          welcome={{
            title: "You're in the 3D museum",
            body: "Walk through your galleries in first person. Want a quick tour of the controls?",
            yes: "Show me",
            no: "I've got it",
          }}
        />
      )}

      {view === "ready" && station && (
        <button onClick={enterStation} style={stationPromptStyle}>
          {station.label}
          <span style={{ opacity: 0.6, marginLeft: 10, fontSize: 12 }}>
            {isTouch ? "tap" : "press E"}
          </span>
        </button>
      )}

      {/* Background music — the chosen track loops; the menu switches tracks */}
      <audio ref={audioRef} loop preload="none" src={MUSIC_TRACKS[trackIdx].src} />
      {/* Rain loop uses Web Audio (see the rain effect above) from public/rain.mp3 */}

      {view === "ready" && (
        <div
          data-tour="music"
          style={{
            ...musicRowStyle,
            bottom: isTouch ? "calc(env(safe-area-inset-bottom, 0px) + 20px)" : 14,
          }}
        >
          {MUSIC_TRACKS.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMusicMenu((o) => !o)}
                style={musicBtnStyle}
                aria-label="Choose track"
                title="Choose a track"
              >
                🎵 {MUSIC_TRACKS[trackIdx].name} ▾
              </button>
              {musicMenu && (
                <div style={musicMenuStyle}>
                  {MUSIC_TRACKS.map((t, i) => (
                    <button
                      key={t.src}
                      onClick={() => pickTrack(i)}
                      style={{
                        ...musicMenuItemStyle,
                        ...(i === trackIdx ? { color: "#e6d3a3" } : null),
                      }}
                    >
                      {i === trackIdx ? "♪ " : ""}
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={toggleMusic} style={musicBtnStyle} aria-label="Toggle music">
            {musicOn ? "🔊 Music on" : "🔈 Music off"}
          </button>
          {/* Phones: weather sits in this right-side column, below the music.
              Shown to everyone (not just the owner) so visitors get the mood too. */}
          {isTouch && (
            <div data-tour="weather" style={skyToggleStyle}>
              {weatherButtons}
            </div>
          )}
        </div>
      )}

      {/* Desktop: weather bottom-left, lifted to align with the middle of the
          music control stack on the right. */}
      {view === "ready" && !isTouch && (
        <div
          data-tour="weather"
          style={{ ...skyToggleStyle, position: "absolute", bottom: 44, left: 14 }}
        >
          {weatherButtons}
        </div>
      )}

      <div style={panelStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {view === "ready" && (
            <button
              onClick={() => setInfoOpen((o) => !o)}
              style={infoToggleStyle}
              aria-label={infoOpen ? "Hide controls" : "Show controls"}
              title={infoOpen ? "Hide controls" : "Show controls"}
            >
              {infoOpen ? "▾" : "ⓘ"}
            </button>
          )}
          <strong style={{ flex: 1 }}>{museum?.name ?? "Museum"}</strong>
        </div>
        {view === "ready" && infoOpen && (
          <div style={{ opacity: 0.85, marginTop: 6 }}>
            {isTouch ? "Joystick to walk · drag to look" : "WASD to walk · drag to look"}{" "}
            · wings open ahead, then left &amp; right · Directory jumps anywhere
          </div>
        )}
        {view !== "ready" && <div style={{ opacity: 0.85 }}>Loading…</div>}
      </div>

      {view === "ready" && layout && layout.nav.length > 0 && (
        <Directory
          nav={layout.nav}
          onPick={(i) => teleport(layout.nav[i].spawn, layout.nav[i].yaw)}
          onHome={() => teleport(ENTRANCE_SPAWN, 0)}
        />
      )}

      {view === "empty" && (
        <div style={centerStyle}>
          No public galleries here yet. Publish a collection to open this museum.
        </div>
      )}
      {view === "loading" && <div style={centerStyle}>Loading the museum…</div>}

      {selected && (
        <div
          style={
            isTouch
              ? { ...cardStyle, bottom: 150, maxHeight: "58vh", width: "92vw" }
              : cardStyle
          }
        >
          {/* Always-visible close: sticks to the top of the card while the body
              scrolls beneath, so it's reachable no matter how long the text is. */}
          <div style={cardCloseRowStyle}>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              style={cardCloseXStyle}
            >
              ✕
            </button>
          </div>
          {selected.image && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/img?url=${encodeURIComponent(selected.image)}`}
              alt={selected.title}
              onError={(e) => {
                // Some museum CDNs block our server but serve visitors fine —
                // fall back to loading straight from the museum.
                const el = e.currentTarget;
                if (!el.dataset.direct && selected.image) {
                  el.dataset.direct = "1";
                  el.src = selected.image;
                }
              }}
              style={{
                width: "100%",
                maxHeight: isTouch ? "34vh" : "48vh",
                objectFit: "contain",
                borderRadius: 8,
                background: "#0d0b09",
                marginBottom: 12,
              }}
            />
          )}
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.25 }}>{selected.title}</div>
          {selected.artist && (
            <div style={{ color: "#d8bd85", fontSize: 14, marginTop: 2 }}>{selected.artist}</div>
          )}
          {(selected.dateText || selected.culture || selected.medium) && (
            <div style={{ color: "#a8a09a", fontSize: 13, marginTop: 6 }}>
              {[selected.dateText, selected.culture, selected.medium].filter(Boolean).join("  ·  ")}
            </div>
          )}
          {selected.description && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 10,
                color: "#ece6da",
              }}
            >
              {selected.description.replace(/<\/?[^>]+>/g, "")}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
            <button onClick={() => setSelected(null)} style={closeBtnStyle}>
              Close
            </button>
            {selected.sourceUrl && (
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#d8bd85", fontSize: 13 }}
              >
                View at{" "}
                {selected.museum ? MUSEUM_LABEL[selected.museum] ?? "the museum" : "the museum"} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  left: 14,
  background: "rgba(20,18,16,0.72)",
  color: "#f3efe9",
  padding: "10px 14px",
  borderRadius: 10,
  fontSize: 13,
  maxWidth: 320,
  lineHeight: 1.5,
};
const infoToggleStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#f3efe9",
  cursor: "pointer",
  fontSize: 15,
  lineHeight: 1,
  padding: 2,
  opacity: 0.8,
};
const musicRowStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 14,
  right: 14,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 6,
};
const musicBtnStyle: React.CSSProperties = {
  background: "rgba(20,18,16,0.72)",
  color: "#f3efe9",
  border: "1px solid #4a423b",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
  width: 172,
  boxSizing: "border-box",
  textAlign: "center",
};
const musicMenuStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 6px)",
  right: 0,
  minWidth: 180,
  maxHeight: 280,
  overflowY: "auto",
  background: "rgba(20,18,16,0.96)",
  border: "1px solid #4a423b",
  borderRadius: 8,
  padding: 4,
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
};
const musicMenuItemStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#f3efe9",
  textAlign: "left",
  padding: "8px 10px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};
const skyToggleStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  background: "rgba(20,18,16,0.72)",
  border: "1px solid #4a423b",
  borderRadius: 8,
  padding: 4,
};
const skyBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};
const skyBtnActiveStyle: React.CSSProperties = {
  background: "rgba(230,211,163,0.22)",
};
const stationPromptStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  background: "rgba(20,18,16,0.86)",
  color: "#f3efe9",
  border: "1px solid #6a5a3a",
  borderRadius: 10,
  padding: "12px 20px",
  cursor: "pointer",
  fontSize: 16,
  fontWeight: 600,
  boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
};
const dirBtnStyle: React.CSSProperties = {
  background: "rgba(20,18,16,0.72)",
  color: "#f3efe9",
  border: "1px solid #4a423b",
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 14,
};
const dirPanelStyle: React.CSSProperties = {
  marginTop: 8,
  background: "rgba(20,18,16,0.92)",
  border: "1px solid #4a423b",
  borderRadius: 10,
  padding: 6,
  maxHeight: "62vh",
  overflowY: "auto",
  minWidth: 210,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const dirItemStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 1,
  background: "none",
  border: "none",
  color: "#f3efe9",
  textAlign: "left",
  padding: "8px 12px",
  borderRadius: 7,
  cursor: "pointer",
  fontSize: 14,
  width: "100%",
};
const centerStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  background: "rgba(20,18,16,0.82)",
  color: "#f3efe9",
  padding: "14px 20px",
  borderRadius: 12,
  fontSize: 14,
  textAlign: "center",
  maxWidth: "80%",
};
const cardStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 20,
  left: "50%",
  transform: "translateX(-50%)",
  background: "rgba(20,18,16,0.9)",
  color: "#f3efe9",
  padding: "16px 20px",
  borderRadius: 14,
  width: "min(460px, 90vw)",
  maxHeight: "88vh",
  overflowY: "auto",
};
const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid #4a423b",
  color: "#f3efe9",
  borderRadius: 8,
  padding: "5px 14px",
  cursor: "pointer",
};
// A small ✕ that floats in the card's top-right corner and stays there while
// the body scrolls (position: sticky) — no background bar, so it never covers
// the artwork.
const cardCloseRowStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  height: 0,
  display: "flex",
  justifyContent: "flex-end",
  pointerEvents: "none",
};
const cardCloseXStyle: React.CSSProperties = {
  pointerEvents: "auto",
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "rgba(20,18,16,0.7)",
  border: "1px solid #6a5f54",
  color: "#f3efe9",
  fontSize: 15,
  lineHeight: 1,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
};
