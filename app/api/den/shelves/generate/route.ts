// POST or GET /api/den/shelves/generate — regenerate the GLOBAL Library
// discovery shelves with an LLM and write them to the discover_shelves cache.
//
// Protected by CRON_SECRET (Vercel cron sends it as a Bearer token; you can
// also trigger it manually with the same header). The LLM is OpenAI-compatible
// — defaults to Groq's free endpoint but works with any such provider via env:
//   LLM_API_KEY   (required)   — provider key
//   LLM_API_URL   (optional)   — chat/completions URL (default: Groq)
//   LLM_MODEL     (optional)   — model id (default: llama-3.3-70b-versatile)
//   CRON_SECRET   (required)   — shared secret authorizing this route
//   SUPABASE_SERVICE_ROLE_KEY  — lets the writer bypass RLS

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter, listMuseums } from "@/lib/museums";
import type { ArtworkCard } from "@/lib/museums/types";

type ShelfDef = { title: string; blurb: string; query: string };

const LIBRARY_PROMPT = `You are curating "discovery shelves" for a public-domain reading app backed by Project Gutenberg (via the Gutendex API).

Produce exactly 6 themed shelves. Each shelf is an object with:
- "title": a short, evocative shelf name (2-5 words), e.g. "Voices from the Ancient World".
- "blurb": one inviting sentence, max ~12 words.
- "query": a Gutendex query string — EITHER "topic=<subject>" (a Gutenberg subject/bookshelf such as adventure, horror, philosophy, mythology, detective, science fiction, poetry, history, fairy tales) OR "search=<keyword or author name>".

Rules:
- Vary the moods and eras; make them feel freshly curated, not plain category names.
- Prefer well-populated topics so each shelf has plenty of books.
- Respond with ONLY a JSON array of 6 objects. No preamble, no markdown fences.

Example element: {"title":"Shadows & Séances","blurb":"Ghost stories and gothic dread.","query":"topic=horror"}`;

const MUSEUM_PROMPT = `You are curating "discovery shelves" for an online art museum that searches the Met, Art Institute of Chicago, Cleveland, Rijksmuseum, Harvard, and the Smithsonian.

Produce exactly 3 themed shelves. Each shelf is an object with:
- "title": a short, evocative shelf name (2-5 words), e.g. "Storms & Seascapes" or "The Color Blue".
- "blurb": one inviting sentence, max ~12 words.
- "query": a short, concrete search phrase that matches lots of artworks — a subject, motif, place, or thing (e.g. "seascape", "portrait of a woman", "flowers", "horses", "moonlight", "still life"). Plain keywords only — NO field prefixes.

Rules:
- Favor visual, well-represented subjects so each shelf has plenty of images.
- Vary moods, eras, and cultures; make them feel freshly curated.
- Respond with ONLY a JSON array of 3 objects. No preamble, no markdown fences.

Example element: {"title":"Storms & Seascapes","blurb":"The sea in all its moods.","query":"seascape"}`;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function parseShelves(text: string): ShelfDef[] {
  // Grab the JSON array even if the model wrapped it in prose or code fences.
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: ShelfDef[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const blurb = typeof o.blurb === "string" ? o.blurb.trim() : "";
    const query = typeof o.query === "string" ? o.query.trim() : "";
    if (!title || !query) continue;
    out.push({ title: title.slice(0, 80), blurb: blurb.slice(0, 160), query });
    if (out.length >= 6) break;
  }
  return out;
}

// Ask the LLM for themed shelves for a surface. Returns raw { title, blurb,
// query } themes; the caller resolves the query into books or artworks.
async function generateThemes(prompt: string): Promise<ShelfDef[]> {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY not set");
  const url =
    process.env.LLM_API_URL || "https://api.groq.com/openai/v1/chat/completions";
  const model = process.env.LLM_MODEL || "llama-3.3-70b-versatile";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.9,
      messages: [
        { role: "system", content: "You output only valid JSON — no prose." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseShelves(data.choices?.[0]?.message?.content ?? "");
}

// Resolve one art theme to real open-access artworks by fanning out across all
// museums (server-side — these APIs aren't IP-blocked like Gutendex).
async function resolveArt(query: string): Promise<ArtworkCard[]> {
  const slugs = listMuseums().map((m) => m.slug);
  const settled = await Promise.allSettled(
    slugs.map((slug) => {
      const a = getAdapter(slug);
      if (!a) return Promise.resolve(null);
      return a.search({
        query,
        filters: {},
        page: 1,
        pageSize: 4,
        hasImage: true,
        openAccessOnly: true,
      });
    })
  );
  const lists: ArtworkCard[][] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      lists.push(r.value.cards.filter((c) => c.thumbnailUrl));
    }
  }
  // Round-robin merge so a shelf mixes museums rather than grouping them.
  const merged: ArtworkCard[] = [];
  const maxLen = lists.reduce((m, l) => Math.max(m, l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const l of lists) if (l[i]) merged.push(l[i]);
  }
  return merged.slice(0, 12);
}

type Surface = "library" | "museum";

// Generate and cache one surface's shelves. Throws with a readable message so
// the caller can report per-surface results.
async function generateFor(surface: Surface): Promise<number> {
  const themes = await generateThemes(
    surface === "museum" ? MUSEUM_PROMPT : LIBRARY_PROMPT
  );
  if (themes.length === 0) throw new Error("no usable shelves generated");

  // Library shelves keep a Gutendex query (resolved in the browser); museum
  // shelves are resolved to real artworks here and cached whole.
  let shelves: unknown[];
  if (surface === "museum") {
    // Keep the homepage uncluttered: at most 3 art shelves.
    const built = await Promise.all(
      themes.slice(0, 3).map(async (t) => ({
        title: t.title,
        blurb: t.blurb,
        items: await resolveArt(t.query),
      }))
    );
    shelves = built.filter((s) => s.items.length > 0);
  } else {
    shelves = themes.map((t) => ({
      title: t.title,
      blurb: t.blurb,
      query: /^(topic|search)=/.test(t.query)
        ? t.query
        : `search=${encodeURIComponent(t.query)}`,
    }));
  }
  if (shelves.length === 0) throw new Error("no shelves resolved to results");

  const admin = createAdminClient();
  // Insert the new set FIRST, then remove the previous one — so a failed write
  // never leaves the discover feed empty (worst case it briefly shows both).
  const { data: inserted, error } = await admin
    .from("discover_shelves")
    .insert({
      surface,
      user_id: null,
      shelves,
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await admin
    .from("discover_shelves")
    .delete()
    .eq("surface", surface)
    .is("user_id", null)
    .neq("id", inserted.id);
  return shelves.length;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // No ?surface= (i.e. the daily cron) regenerates BOTH surfaces. Vercel cron
  // paths can't be relied on to carry a query string, so the schedule hits this
  // route bare and we do the whole job here.
  const param = req.nextUrl.searchParams.get("surface");
  const surfaces: Surface[] =
    param === "museum" ? ["museum"] : param === "library" ? ["library"] : ["library", "museum"];

  const results: Record<string, number | string> = {};
  for (const surface of surfaces) {
    try {
      results[surface] = await generateFor(surface);
    } catch (e) {
      results[surface] = `error: ${(e as Error).message}`;
    }
  }
  const anyOk = Object.values(results).some((v) => typeof v === "number");
  return NextResponse.json({ ok: anyOk, results }, { status: anyOk ? 200 : 502 });
}

export const POST = handle;
export const GET = handle;
