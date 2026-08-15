#!/usr/bin/env node --experimental-strip-types
/**
 * Backfill real_w/real_h on museum_placements.
 *
 *   node --experimental-strip-types scripts/backfill-placement-dimensions.mjs
 *   ... --dry-run                     # show what would change, write nothing
 *   ... --base http://localhost:3002  # where to resolve missing metadata
 *
 * Every placement made before the dimensions fix has real_w/real_h NULL, because
 * neither client POST ever sent them. Museum3D falls back to a fixed height when
 * they are missing, so a miniature and the Night Watch hang at exactly the same
 * size. New placements now carry real dimensions; this repairs the old ones.
 *
 * Dimensions are free text on the artwork ("H 45 × W 30 cm"), so we reuse the
 * SAME parser the app uses — imported from lib/artwork-dimensions.ts rather than
 * copied, so the two can never drift. That is what --experimental-strip-types is
 * for (Node 22+).
 *
 * Two sources, cheapest first:
 *   1. the artworks table, which already holds dimensions for anything saved
 *      into a collection (placements sync there, so most rows hit this);
 *   2. failing that, /api/artwork on a RUNNING dev server — pass --base if it
 *      isn't on :3000. Point this at localhost, not production: the museum APIs
 *      serve a home connection and refuse Vercel's.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseDims } from "../lib/artwork-dimensions.ts";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const BASE = (() => {
  const i = argv.indexOf("--base");
  return (i !== -1 && argv[i + 1] ? argv[i + 1] : "http://localhost:3000").replace(/\/$/, "");
})();

function loadEnv() {
  let raw = "";
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

const { data: rows, error } = await db
  .from("museum_placements")
  .select("id, source, external_id, title, real_w, real_h")
  .is("real_w", null);
if (error) {
  console.error("Could not read placements:", error.message);
  process.exit(1);
}
if (!rows?.length) {
  console.log("Nothing to backfill — every placement already has real_w.");
  process.exit(0);
}
console.log(`${DRY ? "[dry run] " : ""}${rows.length} placement(s) missing dimensions\n`);

// Pass 1: the artworks table already has the text for anything saved to a collection.
const ids = [...new Set(rows.map((r) => r.external_id))];
const { data: arts } = await db
  .from("artworks")
  .select("source_museum, museum_object_id, dimensions")
  .in("museum_object_id", ids);
const known = new Map();
for (const a of arts ?? []) {
  if (a.dimensions) known.set(`${a.source_museum}:${a.museum_object_id}`, a.dimensions);
}

let fixed = 0;
let unresolved = 0;
for (const r of rows) {
  let text = known.get(`${r.source}:${r.external_id}`) ?? null;
  let via = "artworks";

  // Pass 2: ask the running app to resolve it from the museum.
  if (!text) {
    via = "api";
    try {
      const u = `${BASE}/api/artwork?museum=${encodeURIComponent(r.source)}&objectId=${encodeURIComponent(r.external_id)}`;
      const d = await fetch(u).then((x) => x.json());
      text = d?.artwork?.dimensions ?? null;
    } catch (e) {
      console.log(`  ✗ ${r.title?.slice(0, 40)} — ${BASE} unreachable (${e.message})`);
      unresolved++;
      continue;
    }
  }

  const dims = parseDims(text);
  if (!dims) {
    console.log(`  – ${(r.title ?? "").slice(0, 44)} — no usable dimensions${text ? ` (${String(text).slice(0, 40)})` : ""}`);
    unresolved++;
    continue;
  }

  if (!DRY) {
    const { error: upErr } = await db
      .from("museum_placements")
      .update({ real_w: dims.w, real_h: dims.h })
      .eq("id", r.id);
    if (upErr) {
      console.log(`  ✗ ${(r.title ?? "").slice(0, 40)} — ${upErr.message}`);
      unresolved++;
      continue;
    }
  }
  fixed++;
  console.log(
    `  ✓ ${(r.title ?? "").slice(0, 44).padEnd(44)} ${dims.w.toFixed(2)}w × ${dims.h.toFixed(2)}h m  [${via}]`
  );
}

console.log(`\n${DRY ? "Would fix" : "Fixed"}: ${fixed}, unresolved: ${unresolved}.`);
if (unresolved) {
  console.log("Unresolved rows keep the fallback size; harmless, just not to scale.");
}
