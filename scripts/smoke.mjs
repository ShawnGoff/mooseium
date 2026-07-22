#!/usr/bin/env node
/**
 * Smoke test — hits every important page and API and reports what's broken.
 *
 *   node scripts/smoke.mjs                        # localhost:3000
 *   node scripts/smoke.mjs https://www.mooseium.com
 *
 * Exits 1 if anything fails, so it can gate a deploy later if you want.
 * Read-only: it never writes data or touches authenticated routes.
 */

const base = (process.argv[2] || process.env.SMOKE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

const TIMEOUT_MS = 20000;
const CONCURRENCY = 4;

/** @type {{name:string, path:string, status?:number, check?:(body:string)=>true|string}[]} */
const checks = [
  // --- public pages ---
  { name: "home", path: "/", check: (b) => b.includes("Mooseium") || "missing brand" },
  { name: "museums index", path: "/museums" },
  { name: "galleries", path: "/galleries" },
  { name: "library (public)", path: "/library", check: (b) => b.includes("Library") || "no Library heading" },
  { name: "about", path: "/about" },
  { name: "tutorial", path: "/tutorial" },
  { name: "credits", path: "/credits" },
  { name: "contact", path: "/contact" },
  { name: "terms", path: "/terms" },
  { name: "privacy", path: "/privacy" },
  { name: "login", path: "/login" },
  // Gated pages should still render (with a sign-in prompt), not error.
  { name: "den (gated)", path: "/den" },
  { name: "account (gated)", path: "/account" },

  // --- SEO / platform files ---
  { name: "sitemap", path: "/sitemap.xml", check: (b) => b.includes("<urlset") || "not a sitemap" },
  { name: "robots", path: "/robots.txt", check: (b) => b.toLowerCase().includes("sitemap") || "no sitemap line" },
  { name: "manifest", path: "/manifest.webmanifest", check: (b) => b.includes("Mooseium") || "no name" },

  // --- APIs ---
  {
    name: "api/museums",
    path: "/api/museums",
    check: (b) => {
      const d = JSON.parse(b);
      return (d.museums?.length ?? 0) > 0 || "no museums registered";
    },
  },
  {
    name: "api/search (cross-museum)",
    path: "/api/search?museum=all&q=flowers&pageSize=6",
    check: (b) => {
      const d = JSON.parse(b);
      return (d.cards?.length ?? 0) > 0 || "search returned no cards";
    },
  },
  {
    name: "shelves: museum (daily)",
    path: "/api/den/shelves?surface=museum",
    check: (b) => {
      const d = JSON.parse(b);
      const n = d.shelves?.length ?? 0;
      if (n === 0) return "no art shelves cached — the daily job may not be running";
      if (n > 3) return `expected at most 3 art shelves, got ${n}`;
      const empty = d.shelves.filter((s) => (s.items?.length ?? 0) === 0).length;
      return empty === 0 || `${empty} art shelf/shelves have no artworks`;
    },
  },
  {
    name: "shelves: library (daily)",
    path: "/api/den/shelves?surface=library",
    check: (b) => {
      const d = JSON.parse(b);
      return (d.shelves?.length ?? 0) > 0 || "no book shelves cached";
    },
  },
  { name: "api/public-galleries", path: "/api/public-galleries", check: jsonOk },
  { name: "api/discover-museums", path: "/api/discover-museums", check: jsonOk },

  // --- negative checks ---
  { name: "404 page", path: "/definitely-not-a-real-page-xyz", status: 404 },
  {
    name: "img proxy rejects non-museum host",
    path: "/api/img?url=https%3A%2F%2Fexample.com%2Fx.jpg",
    status: 400,
  },
  { name: "cron route requires auth", path: "/api/den/shelves/generate", status: 401 },
];

function jsonOk(b) {
  try {
    JSON.parse(b);
    return true;
  } catch {
    return "not valid JSON";
  }
}

async function run(check) {
  const url = `${base}${check.path}`;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    const body = await res.text();
    const ms = Date.now() - started;
    const wantStatus = check.status ?? 200;
    if (res.status !== wantStatus) {
      return { ...check, ok: false, ms, reason: `expected ${wantStatus}, got ${res.status}` };
    }
    if (check.check) {
      let verdict;
      try {
        verdict = check.check(body);
      } catch (e) {
        verdict = `check threw: ${e.message}`;
      }
      if (verdict !== true) return { ...check, ok: false, ms, reason: verdict };
    }
    return { ...check, ok: true, ms };
  } catch (e) {
    return {
      ...check,
      ok: false,
      ms: Date.now() - started,
      reason: e.name === "AbortError" ? `timed out after ${TIMEOUT_MS}ms` : e.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`\nSmoke testing ${base}\n`);
  const queue = [...checks];
  const results = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const next = queue.shift();
        const r = await run(next);
        results.push(r);
        const mark = r.ok ? "PASS" : "FAIL";
        const slow = r.ms > 3000 ? `  (slow: ${r.ms}ms)` : "";
        console.log(
          `${mark}  ${r.name.padEnd(32)} ${r.ok ? `${r.ms}ms${slow}` : r.reason}`
        );
      }
    })
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailures:");
    for (const f of failed) console.log(`  • ${f.name} (${f.path}) — ${f.reason}`);
    process.exit(1);
  }
  console.log("All good.\n");
}

main();
