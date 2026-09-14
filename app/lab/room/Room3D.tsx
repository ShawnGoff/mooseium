"use client";

// Standalone 3D room (Phase 1). Two modes:
//   • default: a Modern room with placeholder art + a live museum-image CORS test.
//   • /lab/room?g=<share_slug>: hangs a real published gallery's pieces on the
//     walls, textures pulled through the same-origin /api/img proxy.
// Orbit controls (drag to look, scroll to zoom), click a piece for info.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

type Piece = {
  title: string;
  artist?: string;
  color?: string;
  dateText?: string;
  culture?: string;
  medium?: string;
  description?: string;
  museum?: string;
  sourceUrl?: string;
};
type GalleryPiece = {
  title: string;
  artist?: string;
  dateText?: string;
  culture?: string;
  medium?: string;
  description?: string;
  museum?: string;
  sourceUrl?: string;
  image: string;
  feature?: boolean;
};

const MUSEUM_LABEL: Record<string, string> = {
  met: "The Met",
  artic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  rijks: "Rijksmuseum",
  harvard: "Harvard Art Museums",
  smithsonian: "Smithsonian",
  vam: "Victoria and Albert Museum",
};

const FRAME_W = 1.6;
const FRAME_H = 2;
const EYE_Y = 1.8; // player standing eye height
const ART_Y = 2.0; // artwork centerline (just above eye level, gallery-style)

// Prep a texture for flat artwork display: correct color space, and no mipmaps
// (avoids the black-block/banding artifacts on non-power-of-two museum images).
function prep(t: THREE.Texture): THREE.Texture {
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const PLACEHOLDERS: Piece[] = [
  { title: "Composition in Ochre", artist: "Demo", color: "#b9863f" },
  { title: "Study in Teal", artist: "Demo", color: "#2f5d57" },
  { title: "Crimson Field", artist: "Demo", color: "#7a2e2e" },
  { title: "Slate Nocturne", artist: "Demo", color: "#38507a" },
];

function labelTexture(title: string, color: string): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 640;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "italic 30px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(title, c.width / 2, c.height - 48);
  return prep(new THREE.CanvasTexture(c));
}

// First-person controller: WASD / arrows + joystick to move, drag to look.
// Keeps the player inside the room via simple bounds clamping. Sets dragRef
// while looking so a look-drag doesn't also select a piece.
function Player({
  dragRef,
  joyRef,
}: {
  dragRef: React.MutableRefObject<boolean>;
  joyRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(0, EYE_Y, 6));
  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const kd = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const ku = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    const pd = (e: PointerEvent) => {
      // Primary button only — see the matching guard in gallery3d's Player. A
      // right-click started a look-drag whose pointerup the context menu then
      // ate, stranding the camera in a permanent spin.
      if (e.button !== 0) return;
      dragging = true;
      lastX = startX = e.clientX;
      lastY = startY = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 6) {
        dragRef.current = true;
      }
      yaw.current -= dx * 0.0038;
      pitch.current = Math.max(-1.2, Math.min(1.2, pitch.current - dy * 0.0038));
    };
    const pu = () => {
      dragging = false;
      window.setTimeout(() => (dragRef.current = false), 0);
    };
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      window.setTimeout(() => (dragRef.current = false), 0);
    };
    const ctx = (e: MouseEvent) => e.preventDefault();

    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    el.addEventListener("contextmenu", ctx);

    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      el.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
      el.removeEventListener("contextmenu", ctx);
    };
  }, [gl, dragRef]);

  useFrame((_, delta) => {
    const k = keys.current;
    let mf = 0;
    let ms = 0;
    if (k["KeyW"] || k["ArrowUp"]) mf += 1;
    if (k["KeyS"] || k["ArrowDown"]) mf -= 1;
    if (k["KeyD"] || k["ArrowRight"]) ms += 1;
    if (k["KeyA"] || k["ArrowLeft"]) ms -= 1;
    mf += -joyRef.current.y;
    ms += joyRef.current.x;
    const len = Math.hypot(mf, ms);
    if (len > 1) {
      mf /= len;
      ms /= len;
    }
    const speed = 5.2 * Math.min(delta, 0.05);
    const s = Math.sin(yaw.current);
    const c = Math.cos(yaw.current);
    let nx = pos.current.x + (-s * mf + c * ms) * speed;
    let nz = pos.current.z + (-c * mf - s * ms) * speed;
    nx = Math.max(-8.2, Math.min(8.2, nx));
    nz = Math.max(-5.3, Math.min(7, nz));
    pos.current.set(nx, EYE_Y, nz);
    camera.position.copy(pos.current);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch.current, yaw.current, 0, "YXZ"));
  });

  return null;
}

function Frame({
  position,
  rotation,
  texture,
  piece,
  onSelect,
  w = FRAME_W,
  h = FRAME_H,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  texture: THREE.Texture;
  piece: Piece;
  onSelect: (p: Piece) => void;
  w?: number;
  h?: number;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Frame border, set back so its front face doesn't share the art's depth. */}
      <mesh position={[0, 0, -0.09]}>
        <boxGeometry args={[w + 0.22, h + 0.22, 0.12]} />
        <meshStandardMaterial color="#241f1b" />
      </mesh>
      {/* Art sits proud of the frame front (avoids z-fighting banding). */}
      <mesh
        position={[0, 0, 0.02]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.nativeEvent.button !== 0) return; // primary button only
          e.stopPropagation();
          onSelect(piece);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <planeGeometry args={[w, h]} />
        {/* Unlit so art shows true color, evenly, regardless of scene lighting. */}
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

// A frame textured from a real museum image, via the same-origin proxy. Sizes
// itself to the image's aspect ratio so art isn't distorted.
function ProxyArtwork({
  piece,
  position,
  rotation,
  onSelect,
}: {
  piece: GalleryPiece;
  position: [number, number, number];
  rotation?: [number, number, number];
  onSelect: (p: Piece) => void;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: FRAME_W, h: FRAME_H });
  const fallback = useMemo(() => labelTexture(piece.title, "#2a2320"), [piece.title]);

  useEffect(() => {
    let cancelled = false;
    // Decode through a 2D canvas so progressive/CMYK museum JPEGs become clean
    // RGBA before hitting WebGL (fixes black-block artifacts + odd darkness).
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const cw = Math.max(1, Math.round(img.width * scale));
      const ch = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, cw, ch);
      const aspect = cw / ch;
      const h = 2.1;
      const w = Math.min(3.2, Math.max(0.9, h * aspect));
      setDims({ w, h });
      setTex(prep(new THREE.CanvasTexture(canvas)));
    };
    img.onerror = () => {};
    img.src = `/api/img?url=${encodeURIComponent(piece.image)}`;
    return () => {
      cancelled = true;
    };
  }, [piece.image]);

  return (
    <Frame
      position={position}
      rotation={rotation}
      texture={tex ?? fallback}
      w={dims.w}
      h={dims.h}
      piece={{
        title: piece.title,
        artist: piece.artist,
        dateText: piece.dateText,
        culture: piece.culture,
        medium: piece.medium,
        description: piece.description,
        museum: piece.museum,
        sourceUrl: piece.sourceUrl,
      }}
      onSelect={onSelect}
    />
  );
}

// Distribute up to 12 pieces across the back + two side walls, evenly spaced.
function placements(n: number): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const per = [0, 0, 0];
  for (let i = 0; i < n; i++) per[i % 3]++;
  const idx = [0, 0, 0];
  const out: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const w = i % 3;
    const c = per[w];
    const j = idx[w]++;
    const f = c <= 1 ? 0.5 : j / (c - 1);
    if (w === 0) out.push({ position: [-6 + 12 * f, ART_Y,-5.85], rotation: [0, 0, 0] });
    else if (w === 1) out.push({ position: [-8.85, ART_Y,-6 + 8 * f], rotation: [0, Math.PI / 2, 0] });
    else out.push({ position: [8.85, ART_Y,-6 + 8 * f], rotation: [0, -Math.PI / 2, 0] });
  }
  return out;
}

function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[6, 10, 8]} intensity={0.7} />
      <directionalLight position={[-6, 8, 4]} intensity={0.25} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]}>
        <planeGeometry args={[30, 28]} />
        <meshStandardMaterial color="#cfc9c0" />
      </mesh>
      <mesh position={[0, 4, -6]}>
        <planeGeometry args={[24, 8]} />
        <meshStandardMaterial color="#ece8e1" />
      </mesh>
      <mesh position={[-9, 4, -2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[24, 8]} />
        <meshStandardMaterial color="#e4dfd7" />
      </mesh>
      <mesh position={[9, 4, -2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[24, 8]} />
        <meshStandardMaterial color="#e4dfd7" />
      </mesh>

      {children}
    </>
  );
}

// On-screen movement pad for touch devices.
function JoystickPad({ joyRef }: { joyRef: React.MutableRefObject<{ x: number; y: number }> }) {
  const base = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const el = base.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = r.width / 2;
    const dist = Math.hypot(dx, dy);
    if (dist > max) {
      dx = (dx / dist) * max;
      dy = (dy / dist) * max;
    }
    setKnob({ x: dx, y: dy });
    joyRef.current = { x: dx / max, y: dy / max };
  };
  const end = () => {
    active.current = false;
    setKnob({ x: 0, y: 0 });
    joyRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={base}
      onPointerDown={(e) => {
        e.stopPropagation();
        active.current = true;
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => active.current && update(e.clientX, e.clientY)}
      onPointerUp={end}
      onPointerLeave={end}
      style={{
        position: "absolute",
        left: 22,
        bottom: 26,
        width: 116,
        height: 116,
        borderRadius: "50%",
        background: "rgba(20,18,16,0.35)",
        border: "1px solid rgba(255,255,255,0.25)",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 48,
          height: 48,
          marginLeft: -24,
          marginTop: -24,
          borderRadius: "50%",
          background: "rgba(240,236,229,0.85)",
          transform: `translate(${knob.x}px, ${knob.y}px)`,
        }}
      />
    </div>
  );
}

function DemoRoom({
  corsUrl,
  onStatus,
  onSelect,
}: {
  corsUrl: string | null;
  onStatus: (s: "loaded" | "blocked") => void;
  onSelect: (p: Piece) => void;
}) {
  const t0 = useMemo(() => labelTexture(PLACEHOLDERS[0].title, PLACEHOLDERS[0].color!), []);
  const t1 = useMemo(() => labelTexture(PLACEHOLDERS[1].title, PLACEHOLDERS[1].color!), []);
  const t2 = useMemo(() => labelTexture(PLACEHOLDERS[2].title, PLACEHOLDERS[2].color!), []);
  const t3 = useMemo(() => labelTexture(PLACEHOLDERS[3].title, PLACEHOLDERS[3].color!), []);
  const [realTex, setRealTex] = useState<THREE.Texture | null>(null);
  const loading = useMemo(() => labelTexture("Loading…", "#3a332e"), []);

  useEffect(() => {
    if (!corsUrl) return;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      `/api/img?url=${encodeURIComponent(corsUrl)}`,
      (t) => {
        prep(t);
        setRealTex(t);
        onStatus("loaded");
      },
      undefined,
      () => onStatus("blocked")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corsUrl]);

  return (
    <RoomShell>
      <Frame position={[-4, ART_Y,-5.85]} texture={t0} piece={PLACEHOLDERS[0]} onSelect={onSelect} />
      <Frame
        position={[0, ART_Y,-5.85]}
        texture={realTex ?? loading}
        piece={{ title: "Live museum image (CORS test)", artist: "The Met" }}
        onSelect={onSelect}
      />
      <Frame position={[4, ART_Y,-5.85]} texture={t1} piece={PLACEHOLDERS[1]} onSelect={onSelect} />
      <Frame
        position={[-8.85, ART_Y,-2]}
        rotation={[0, Math.PI / 2, 0]}
        texture={t2}
        piece={PLACEHOLDERS[2]}
        onSelect={onSelect}
      />
      <Frame
        position={[8.85, ART_Y,-2]}
        rotation={[0, -Math.PI / 2, 0]}
        texture={t3}
        piece={PLACEHOLDERS[3]}
        onSelect={onSelect}
      />
    </RoomShell>
  );
}

function GalleryRoom({
  pieces,
  onSelect,
}: {
  pieces: GalleryPiece[];
  onSelect: (p: Piece) => void;
}) {
  const spots = useMemo(() => placements(pieces.length), [pieces.length]);
  return (
    <RoomShell>
      {pieces.map((p, i) => (
        <ProxyArtwork
          key={i}
          piece={p}
          position={spots[i].position}
          rotation={spots[i].rotation}
          onSelect={onSelect}
        />
      ))}
    </RoomShell>
  );
}

export default function Room3D() {
  const [selected, setSelected] = useState<Piece | null>(null);
  const [mode, setMode] = useState<"demo" | "gallery">("demo");
  const [pieces, setPieces] = useState<GalleryPiece[]>([]);
  const [galleryName, setGalleryName] = useState<string | null>(null);
  const [corsUrl, setCorsUrl] = useState<string | null>(null);
  const [cors, setCors] = useState<"pending" | "loaded" | "blocked">("pending");
  const [isTouch, setIsTouch] = useState(false);
  const started = useRef(false);
  const dragRef = useRef(false);
  const joyRef = useRef({ x: 0, y: 0 });

  const handleSelect = (p: Piece) => {
    // Ignore selections that were actually look-drags.
    if (!dragRef.current) setSelected(p);
  };

  useEffect(() => {
    setIsTouch("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const slug = new URLSearchParams(window.location.search).get("g");
    if (slug) {
      fetch(`/api/gallery-pieces?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.pieces?.length) {
            setPieces(d.pieces.slice(0, 12));
            setGalleryName(d.name ?? null);
            setMode("gallery");
          }
        })
        .catch(() => {});
      return;
    }
    // Demo mode: grab one real museum image for the CORS-proof frame.
    fetch("/api/search?museum=met&q=landscape&page=1&pageSize=1")
      .then((r) => r.json())
      .then((d) => setCorsUrl(d.cards?.[0]?.thumbnailUrl ?? null))
      .catch(() => setCors("blocked"));
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "calc(100vh - 60px)",
        touchAction: "none",
      }}
    >
      <Canvas camera={{ fov: 52, position: [0, EYE_Y, 6] }}>
        <color attach="background" args={["#f2efe9"]} />
        <Player dragRef={dragRef} joyRef={joyRef} />
        {mode === "gallery" ? (
          <GalleryRoom pieces={pieces} onSelect={handleSelect} />
        ) : (
          <DemoRoom corsUrl={corsUrl} onStatus={setCors} onSelect={handleSelect} />
        )}
      </Canvas>
      {isTouch && <JoystickPad joyRef={joyRef} />}

      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          background: "rgba(20,18,16,0.72)",
          color: "#f3efe9",
          padding: "10px 14px",
          borderRadius: 10,
          fontSize: 13,
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        <strong>{mode === "gallery" ? galleryName ?? "Gallery" : "3D room — demo"}</strong>
        <div>
          {isTouch
            ? "Joystick to walk · drag to look · tap a piece for info."
            : "W A S D to walk · drag to look · click a piece for info."}
        </div>
        {mode === "demo" && (
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Add <code>?g=YOUR_SHARE_SLUG</code> to walk a real gallery.
          </div>
        )}
      </div>

      {mode === "demo" && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "rgba(20,18,16,0.72)",
            color: "#f3efe9",
            padding: "8px 12px",
            borderRadius: 10,
            fontSize: 12,
          }}
        >
          Museum image texture:{" "}
          <strong
            style={{
              color:
                cors === "loaded" ? "#7bd88f" : cors === "blocked" ? "#f08a8a" : "#d8bd85",
            }}
          >
            {cors === "pending" ? "testing…" : cors === "loaded" ? "loaded ✓" : "blocked (CORS)"}
          </strong>
        </div>
      )}

      {selected && (
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(20,18,16,0.9)",
            color: "#f3efe9",
            padding: "16px 20px",
            borderRadius: 14,
            textAlign: "left",
            width: "min(460px, 90vw)",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.25 }}>
            {selected.title}
          </div>
          {selected.artist && (
            <div style={{ color: "#d8bd85", fontSize: 14, marginTop: 2 }}>
              {selected.artist}
            </div>
          )}
          {(selected.dateText || selected.culture || selected.medium) && (
            <div style={{ color: "#a8a09a", fontSize: 13, marginTop: 6 }}>
              {[selected.dateText, selected.culture, selected.medium]
                .filter(Boolean)
                .join("  ·  ")}
            </div>
          )}
          {selected.description && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.5,
                marginTop: 10,
                maxHeight: 150,
                overflowY: "auto",
                color: "#ece6da",
              }}
            >
              {selected.description}
            </div>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginTop: 12,
            }}
          >
            <button
              onClick={() => setSelected(null)}
              style={{
                background: "none",
                border: "1px solid #4a423b",
                color: "#f3efe9",
                borderRadius: 8,
                padding: "5px 14px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
            {selected.sourceUrl && (
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#d8bd85", fontSize: 13 }}
              >
                View at {selected.museum ? MUSEUM_LABEL[selected.museum] ?? "the museum" : "the museum"} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
