#!/usr/bin/env node
/**
 * Copy museum artwork images into our own Supabase Storage bucket.
 *
 *   node scripts/cache-artwork-images.mjs --museum artic --dry-run
 *   node scripts/cache-artwork-images.mjs --museum artic
 *   node scripts/cache-artwork-images.mjs --museum artic --retry   # retry failures
 *   node scripts/cache-artwork-images.mjs --all                    # every museum
 *   ... --max-kb 4096   # raise the per-image size ceiling (default 1024)
 *
 * RUN THIS FROM A NORMAL CONNECTION, NOT FROM VERCEL.
 *
 * That is the whole point. Several museum CDNs refuse Vercel's datacenter IPs:
 * in production /api/img gets an immediate 502 for every Art Institute and
 * Harvard image, while the identical URLs return 200 from a laptop. So the
 * machine doing the copying has to be one the museums will actually serve —
 * yours. Once an image is in the bucket it is served from Supabase's CDN, which
 * no longer depends on the museums' IP rules at all.
 *
 * CACHE ONLY WHAT IS BROKEN. Caching costs Supabase storage AND egress on every
 * view, where the museum's own CDN currently serves those bytes for free. Only
 * the Art Institute genuinely needs it: Harvard recovers through ProxyArtwork's
 * direct-from-museum fallback, and the Met and Cleveland load fine from Vercel.
 * Their images are also far larger — measured averages:
 *
 *   artic 255 KB · harvard 181 KB · met ~3 MB · cleveland ~4.3 MB
 *
 * so caching all 120 rows would move ~300 MB for no benefit. Hence --museum is
 * REQUIRED; pass --all only if you mean it.
 *
 * The size ceiling exists for the same reason: ProxyArtwork downscales to 1600px
 * (1024 on touch) before it ever becomes a texture, so storing a 4 MB original
 * pays storage and bandwidth for pixels nobody sees. Oversized images are skipped
 * and reported rather than silently shrunk — resizing here would need a decoder,
 * and the honest fix is to store a smaller museum derivative.
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
 * The service role key is needed to write to storage and is never sent anywhere
 * except your own Supabase project.
 *
 * Safe to re-run: it only touches rows with no image_cached_url, uploads with
 * upsert, and records image_cached_at so a later --retry can find failures.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "artwork-images";
const CONCURRENCY = 4;
const TIMEOUT_MS = 30000;

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};
const LIMIT = Number(value("limit", "0")) || 0;
const MUSEUM = value("museum", null);
const ALL = flag("all");
const DRY = flag("dry-run");
const RETRY = flag("retry");
// Per-image ceiling. 1 MB comfortably covers the museums that actually need
// caching and excludes the multi-megabyte originals that don't.
const MAX_BYTES = (Number(value("max-kb", "1024")) || 1024) * 1024;

if (!MUSEUM && !ALL) {
  console.error(
    "Refusing to run without a scope.\n\n" +
      "  --museum <slug>   cache one museum (this is almost always what you want)\n" +
      "  --all             cache every museum\n\n" +
      "Only the Art Institute is actually broken in production — Harvard recovers\n" +
      "via the direct-from-museum fallback, and the Met and Cleveland load fine.\n" +
      "Caching those would move hundreds of MB into Supabase storage and egress to\n" +
      "fix nothing. Start with:\n\n" +
      "  node scripts/cache-artwork-images.mjs --museum artic --dry-run\n"
  );
  process.exit(1);
}

// --- env --------------------------------------------------------------------
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
    const v = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked env and .env.local)."
  );
  process.exit(1);
}
const db = createClient(URL_, KEY, { auth: { persistSession: false } });

// --- helpers ----------------------------------------------------------------
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** The image we'd rather keep: big enough for a wall, not a 100MB IIIF original. */
function sourceUrl(a) {
  return a.image_medium_url || a.image_large_url || a.image_thumb_url || a.source_image_url;
}

async function fetchImage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: {
        // Same browser-shaped headers /api/img sends, so we get the same bytes
        // a visitor would.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const type = (r.headers.get("content-type") || "").split(";")[0].trim();
    if (!type.startsWith("image/")) return { error: `not an image (${type || "no type"})` };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1024) return { error: `suspiciously small (${buf.byteLength}b)` };
    return { buf, type };
  } catch (e) {
    return { error: e.name === "AbortError" ? "timeout" : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function cacheOne(a) {
  const src = sourceUrl(a);
  if (!src) return { id: a.id, skipped: "no source url" };

  const got = await fetchImage(src);
  if (got.error) return { id: a.id, failed: got.error, title: a.title };

  // Too big to be worth storing and serving: the client downscales to 1600px
  // anyway. Reported, not silently dropped, so an oversized museum is visible.
  if (got.buf.byteLength > MAX_BYTES) {
    return {
      id: a.id,
      skipped: `${(got.buf.byteLength / 1024 / 1024).toFixed(1)} MB exceeds the ${(
        MAX_BYTES / 1024
      ).toFixed(0)} KB ceiling — raise with --max-kb if you really want it`,
    };
  }

  const ext = EXT[got.type] || "jpg";
  const path = `${a.source_museum}/${a.museum_object_id}.${ext}`;

  if (DRY) return { id: a.id, wouldCache: path, bytes: got.buf.byteLength };

  const up = await db.storage
    .from(BUCKET)
    .upload(path, got.buf, { contentType: got.type, upsert: true });
  if (up.error) return { id: a.id, failed: `upload: ${up.error.message}`, title: a.title };

  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  const { error } = await db
    .from("artworks")
    .update({ image_cached_url: data.publicUrl, image_cached_at: new Date().toISOString() })
    .eq("id", a.id);
  if (error) return { id: a.id, failed: `db: ${error.message}`, title: a.title };

  return { id: a.id, cached: path, bytes: got.buf.byteLength };
}

// --- main -------------------------------------------------------------------
let q = db
  .from("artworks")
  .select(
    "id, title, source_museum, museum_object_id, image_medium_url, image_large_url, image_thumb_url, source_image_url"
  )
  .is("image_cached_url", null);
if (!RETRY) q = q.is("image_cached_at", null); // skip rows a previous run already failed on
if (MUSEUM) q = q.eq("source_museum", MUSEUM);
if (LIMIT) q = q.limit(LIMIT);

const { data: rows, error } = await q;
if (error) {
  console.error("Could not read artworks:", error.message);
  process.exit(1);
}
if (!rows || rows.length === 0) {
  console.log("Nothing to cache — every artwork already has image_cached_url.");
  process.exit(0);
}

console.log(
  `${DRY ? "[dry run] " : ""}Caching ${rows.length} artwork image${rows.length === 1 ? "" : "s"}${
    MUSEUM ? ` from ${MUSEUM}` : ""
  }…\n`
);

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < rows.length) {
    const a = rows[cursor++];
    const r = await cacheOne(a);
    results.push(r);
    const n = String(results.length).padStart(String(rows.length).length);
    const kb = r.bytes ? `${(r.bytes / 1024).toFixed(0).padStart(5)} KB  ` : "";
    if (r.failed) console.log(`${n}/${rows.length}  ✗ ${a.source_museum}  ${r.failed}  — ${a.title ?? ""}`);
    else if (r.skipped) console.log(`${n}/${rows.length}  – ${a.source_museum}  ${r.skipped}  — ${(a.title ?? "").slice(0, 34)}`);
    else console.log(`${n}/${rows.length}  ✓ ${a.source_museum}  ${kb}${r.cached ?? r.wouldCache}`);
    // Mark failures so a plain re-run skips them and --retry can find them.
    if (r.failed && !DRY) {
      await db.from("artworks").update({ image_cached_at: new Date().toISOString() }).eq("id", a.id);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

const ok = results.filter((r) => r.cached || r.wouldCache).length;
const bad = results.filter((r) => r.failed);
console.log(`\nDone: ${ok} cached, ${bad.length} failed, ${results.length - ok - bad.length} skipped.`);
if (bad.length) {
  const byMuseum = {};
  for (const b of bad) byMuseum[b.failed] = (byMuseum[b.failed] || 0) + 1;
  console.log("Failures:", byMuseum);
  console.log("Re-try just these with:  node scripts/cache-artwork-images.mjs --retry");
}
