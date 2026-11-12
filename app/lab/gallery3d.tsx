"use client";

// Reusable 3D gallery primitives shared by the single-room demo and the museum
// lobby: first-person Player, framed artwork, room shell, on-screen joystick.

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

// Coarse touch check for mobile quality tiers (smaller textures on phones).
const IS_TOUCH =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

import { EYE_Y, ART_Y } from "./constants";
import { displaySize, fitImage } from "./art-size";
export { EYE_Y, ART_Y };
const FRAME_W = 1.6;
const FRAME_H = 2;

export type Piece = {
  title: string;
  artist?: string;
  color?: string;
  dateText?: string;
  culture?: string;
  medium?: string;
  description?: string;
  museum?: string;
  sourceUrl?: string;
  image?: string;
  // Full-resolution copy for the zoom lightbox. `image` is capped around 800px
  // so the placard loads fast, which is too soft once it fills the screen.
  imageFull?: string;
};
export type GalleryPiece = {
  title: string;
  artist?: string;
  dateText?: string;
  culture?: string;
  medium?: string;
  description?: string;
  museum?: string;
  sourceUrl?: string;
  realW?: number; // real width in meters (from museum dimensions)
  realH?: number; // real height in meters
  image: string;
  imageFull?: string; // biggest stored copy, for the zoom lightbox
  imageThumb?: string; // fallback if the main image fails to load
  feature?: boolean;
};

export const MUSEUM_LABEL: Record<string, string> = {
  met: "The Met",
  artic: "Art Institute of Chicago",
  cleveland: "Cleveland Museum of Art",
  rijks: "Rijksmuseum",
  harvard: "Harvard Art Museums",
  smithsonian: "Smithsonian",
  vam: "Victoria and Albert Museum",
};

// Clean RGBA texture, no mipmaps (avoids banding on non-power-of-two images).
export function prep(t: THREE.Texture): THREE.Texture {
  t.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps back on (the earlier banding was z-fighting, not mipmaps) so art
  // doesn't shimmer/alias at a distance; anisotropy keeps oblique angles sharp.
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// constrain(nextX, nextZ, prevX, prevZ) -> clamped position (+ optional wing to enter)
export type Constrain = (
  nx: number,
  nz: number,
  px: number,
  pz: number
) => { x: number; z: number; enter?: number };

const defaultConstrain: Constrain = (nx, nz) => ({
  x: Math.max(-8.2, Math.min(8.2, nx)),
  z: Math.max(-5.3, Math.min(7, nz)),
});

export function Player({
  dragRef,
  joyRef,
  spawn = [0, EYE_Y, 6],
  spawnYaw = 0,
  speed = 5.2,
  constrain = defaultConstrain,
  onEnter,
  posRef,
  pausedRef,
  sitRef,
  onSeated,
  keysRef,
}: {
  dragRef: React.MutableRefObject<boolean>;
  joyRef: React.MutableRefObject<{ x: number; y: number }>;
  spawn?: [number, number, number];
  spawnYaw?: number;
  speed?: number;
  constrain?: Constrain;
  onEnter?: (wing: number) => void;
  posRef?: React.MutableRefObject<{ x: number; z: number }>;
  pausedRef?: React.MutableRefObject<boolean>;
  // When set, the camera animates into this seated pose (and calls onSeated on
  // arrival) instead of responding to movement.
  sitRef?: React.MutableRefObject<{ x: number; z: number; y: number; yaw: number } | null>;
  onSeated?: () => void;
  // Optional external held-keys ref so the parent can clear stuck movement keys
  // (e.g. after a HUD dropdown swallows the keyup). Falls back to internal state.
  keysRef?: React.MutableRefObject<Record<string, boolean>>;
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(spawnYaw);
  const pitch = useRef(0);
  const pos = useRef(new THREE.Vector3(spawn[0], EYE_Y, spawn[2]));
  const eyeY = useRef(EYE_Y);
  const internalKeys = useRef<Record<string, boolean>>({});
  const keys = keysRef ?? internalKeys;

  useEffect(() => {
    // Don't drive the player while the user is typing in a field (e.g. the art
    // search box) — otherwise "WASD" in a query walks the character around.
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return (
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      );
    };
    const kd = (e: KeyboardEvent) => {
      if (typing(e)) return;
      keys.current[e.code] = true;
    };
    const ku = (e: KeyboardEvent) => (keys.current[e.code] = false);
    // If the page loses keyboard focus (alt-tab, a HUD control opening) the keyup
    // can be swallowed, leaving a movement key stuck "down". Clear on blur.
    const clearKeys = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("blur", clearKeys);

    const el = gl.domElement;
    let dragging = false;
    let activeId = -1; // only track ONE pointer (so the joystick finger + look finger don't fight)
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    const pd = (e: PointerEvent) => {
      if (dragging || pausedRef?.current) return;
      // Primary button only. Right- and middle-click used to start a look-drag
      // too, and the browser then opened its context menu, which swallowed the
      // pointerup that ends the drag — leaving `dragging` stuck true so the
      // camera kept spinning with every later mouse move. Touch and pen both
      // report button 0 on contact, so this does not affect them.
      if (e.button !== 0) return;
      dragging = true;
      activeId = e.pointerId;
      lastX = startX = e.clientX;
      lastY = startY = e.clientY;
    };
    const pm = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== activeId) return;
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
    const pu = (e: PointerEvent) => {
      if (e.pointerId !== activeId) return;
      dragging = false;
      activeId = -1;
      window.setTimeout(() => (dragRef.current = false), 0);
    };
    // Belt and braces for the same failure: if a pointerup is ever lost — the
    // pointer is cancelled, or focus leaves mid-drag — drop the drag rather than
    // leave the camera following the mouse forever.
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      activeId = -1;
      window.setTimeout(() => (dragRef.current = false), 0);
    };
    // The browser context menu is useless over a 3D viewport and it is what eats
    // the pointerup. Suppress it on the canvas only, so right-click elsewhere on
    // the page (links, the HUD, text) behaves normally.
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
      window.removeEventListener("blur", clearKeys);
      el.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("blur", endDrag);
      el.removeEventListener("contextmenu", ctx);
    };
  }, [gl, dragRef]);

  useFrame((_, delta) => {
    // Sit / stand animation takes over the camera when a seated pose is set.
    const sit = sitRef?.current;
    if (sit) {
      const p = pos.current;
      const t = Math.min(1, delta * 6);
      p.x += (sit.x - p.x) * t;
      p.z += (sit.z - p.z) * t;
      eyeY.current += (sit.y - eyeY.current) * t;
      let dyaw = sit.yaw - yaw.current;
      while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      yaw.current += dyaw * t;
      pitch.current += (0 - pitch.current) * t;
      camera.position.set(p.x, eyeY.current, p.z);
      camera.quaternion.setFromEuler(
        new THREE.Euler(pitch.current, yaw.current, 0, "YXZ")
      );
      if (posRef) {
        posRef.current.x = p.x;
        posRef.current.z = p.z;
      }
      if (
        Math.abs(sit.x - p.x) < 0.02 &&
        Math.abs(sit.z - p.z) < 0.02 &&
        Math.abs(sit.y - eyeY.current) < 0.02 &&
        Math.abs(dyaw) < 0.02
      ) {
        onSeated?.();
      }
      keys.current = {};
      return;
    }
    eyeY.current = EYE_Y;
    if (pausedRef?.current) {
      keys.current = {};
      return;
    }
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
    const step = speed * Math.min(delta, 0.05);
    const s = Math.sin(yaw.current);
    const c = Math.cos(yaw.current);
    const nx = pos.current.x + (-s * mf + c * ms) * step;
    const nz = pos.current.z + (-c * mf - s * ms) * step;
    const r = constrain(nx, nz, pos.current.x, pos.current.z);
    pos.current.set(r.x, EYE_Y, r.z);
    if (posRef) {
      posRef.current.x = r.x;
      posRef.current.z = r.z;
    }
    camera.position.copy(pos.current);
    camera.quaternion.setFromEuler(
      new THREE.Euler(pitch.current, yaw.current, 0, "YXZ")
    );
    if (r.enter != null) onEnter?.(r.enter);
  });

  return null;
}

export function Frame({
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
      <mesh position={[0, 0, -0.09]}>
        <boxGeometry args={[w + 0.34, h + 0.34, 0.12]} />
        <meshStandardMaterial color="#241f1b" />
      </mesh>
      {/* mat board between the dark frame and the image */}
      <mesh position={[0, 0, 0.0]}>
        <planeGeometry args={[w + 0.2, h + 0.2]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.9} />
      </mesh>
      <mesh
        position={[0, 0, 0.02]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          // r3f synthesises onClick from pointer events and does not filter by
          // button, so without this a right-click opens the placard — which now
          // that the canvas suppresses the context menu would be the only thing
          // right-click did.
          if (e.nativeEvent.button !== 0) return;
          e.stopPropagation();
          onSelect(piece);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "default")}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function ProxyArtwork({
  piece,
  position,
  rotation,
  scale = 1,
  onSelect,
}: {
  piece: GalleryPiece;
  position: [number, number, number];
  rotation?: [number, number, number];
  // How much the layout shrank this piece to fit its wall (1 = real size).
  scale?: number;
  onSelect: (p: Piece) => void;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  // The box the layout kept clear for this piece. Whatever is drawn — the title
  // card while loading, then the image at its own aspect — is fitted inside it,
  // so a piece can never be wider than the wall space reserved for it.
  const box = useMemo(() => {
    const full = displaySize({ realW: piece.realW, realH: piece.realH });
    return { w: full.w * scale, h: full.h * scale };
  }, [piece.realW, piece.realH, scale]);
  const [aspect, setAspect] = useState<number | null>(null);
  const dims = fitImage(box, aspect ?? 512 / 640); // the title card is 512×640
  // While loading (or if an image fails), show the title instead of black.
  const fallback = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 640;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#2a2320";
    ctx.fillRect(0, 0, 512, 640);
    ctx.fillStyle = "rgba(240,236,229,0.7)";
    ctx.font = "italic 30px Georgia, serif";
    ctx.textAlign = "center";
    const lines: string[] = [];
    let line = "";
    for (const word of piece.title.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 440 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const startY = 320 - ((lines.length - 1) * 38) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, 256, startY + i * 38));
    return prep(new THREE.CanvasTexture(c));
  }, [piece.title]);
  // Every piece builds one of these, and prep() gives it mipmaps — ~1.75MB of
  // VRAM apiece that used to leak: the artwork texture below is disposed and so
  // is the nameplate's, but this one never was. With ~38 pieces resident that is
  // ~66MB abandoned per mount, and it recurs every time a gallery streams in or
  // out. In dev it is doubled again by StrictMode's second mount and compounded
  // by every hot reload, which is why the context dies locally while production
  // survives.
  useEffect(() => () => fallback.dispose(), [fallback]);

  useEffect(() => {
    let cancelled = false;
    let triedThumb = false;
    let triedDirect = false;
    let created: THREE.Texture | null = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      // Each of these becomes a mipmapped GPU texture — ~13.6MB of VRAM at 1600px
      // versus ~5.6MB at 1024 — and the museum keeps ~38 resident at once (2
      // streamed galleries x 11 pieces, plus wall placements). That is a real
      // budget worth remembering, but it is NOT what caused the "Context Lost"
      // crash: that one died with textures: 0, geometries: 0, drawCalls: 0, before
      // anything reached the GPU, and turned out to be StrictMode tearing down the
      // renderer in dev. Capping here was treating the wrong cause.
      //
      // So keep the resolution — the paintings are the product. If a real device
      // ever does run out, the context-loss report in Museum3D now arrives with a
      // texture count, which is what a cap should be chosen from.
      const maxDim = IS_TOUCH ? 1024 : 1600;
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const cw = Math.max(1, Math.round(img.width * scale));
      const ch = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, cw, ch);
      // Frame SHAPE comes from the image aspect (never distort); the stated
      // dimensions set the box it is fitted into (see art-size.ts).
      setAspect(cw / ch);
      created = prep(new THREE.CanvasTexture(canvas));
      setTex(created);
    };
    img.onerror = () => {
      if (cancelled) return;
      // A broken size (e.g. a missing IIIF derivative) — try the thumbnail.
      if (!triedThumb && piece.imageThumb && piece.imageThumb !== piece.image) {
        triedThumb = true;
        img.src = `/api/img?url=${encodeURIComponent(piece.imageThumb)}`;
        return;
      }
      // Last resort: load straight from the museum. Some CDNs (Harvard's)
      // block our server's IP but serve visitors fine. Needs CORS to work as
      // a WebGL texture; if the museum doesn't send it, we keep the title card.
      if (!triedDirect) {
        triedDirect = true;
        img.src = piece.image;
      }
    };
    img.src = `/api/img?url=${encodeURIComponent(piece.image)}`;
    return () => {
      cancelled = true;
      if (created) created.dispose(); // free VRAM when the piece/wing changes
    };
  }, [piece.image, piece.imageThumb]);

  return (
    <group position={position} rotation={rotation}>
      <Frame
        position={[0, 0, 0]}
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
          image: piece.image,
          imageFull: piece.imageFull,
        }}
        onSelect={onSelect}
      />
      {/* brass picture-light fixture above the frame */}
      <mesh position={[0, dims.h / 2 + 0.16, 0.06]}>
        <boxGeometry args={[Math.min(dims.w, 1.3), 0.05, 0.12]} />
        <meshStandardMaterial
          color="#d8b878"
          emissive="#8a6a2a"
          emissiveIntensity={0.5}
          metalness={0.6}
          roughness={0.4}
        />
      </mesh>
      <Nameplate title={piece.title} artist={piece.artist} y={-(dims.h / 2) - 0.18} />
    </group>
  );
}

// Shrink the font until the text fits maxW; truncate with an ellipsis only if it
// still doesn't fit at the smallest size.
function fitLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  startPx: number,
  minPx: number,
  style: string
): number {
  let px = startPx;
  ctx.font = `${style} ${px}px Georgia, 'Times New Roman', serif`;
  while (px > minPx && ctx.measureText(text).width > maxW) {
    px -= 2;
    ctx.font = `${style} ${px}px Georgia, 'Times New Roman', serif`;
  }
  return px;
}

// An engraved brass wall label mounted below a framed piece.
function Nameplate({ title, artist, y }: { title: string; artist?: string; y: number }) {
  const tex = useMemo(() => {
    const W = 680;
    const H = 190;
    const PAD = 44;
    const maxW = W - PAD * 2;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    // brushed-bronze plate
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#3a2f24");
    g.addColorStop(1, "#271f18");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#8a6f42";
    ctx.lineWidth = 5;
    ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.textAlign = "center";

    const drawFit = (
      text: string,
      cy: number,
      startPx: number,
      minPx: number,
      style: string,
      color: string
    ) => {
      const px = fitLine(ctx, text, maxW, startPx, minPx, style);
      let t = text;
      if (ctx.measureText(t).width > maxW) {
        while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
        t = t.trimEnd() + "…";
      }
      ctx.fillStyle = color;
      ctx.fillText(t, W / 2, cy);
      return px;
    };

    drawFit(title, artist ? 78 : 108, 46, 26, "bold", "#e6d3a3");
    if (artist) {
      drawFit(artist, 130, 34, 20, "italic", "#c1a86e");
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    return texture;
  }, [title, artist]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, y, 0.04]}>
      <planeGeometry args={[0.82, 0.23]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

// A standard rectangular wing room (light Modern look).
export function WingShell({ children }: { children: React.ReactNode }) {
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

export function JoystickPad({
  joyRef,
}: {
  joyRef: React.MutableRefObject<{ x: number; y: number }>;
}) {
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
        // The viewport now uses dvh (ends above Safari's toolbar), so a small
        // inset keeps the joystick just above the visible bottom edge.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
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
