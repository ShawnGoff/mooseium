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
    let query = typeof o.query === "string" ? o.query.trim() : "";
    if (!title || !query) continue;
    // Coerce anything that isn't a topic/search query into a keyword search.
    if (!/^(topic|search)=/.test(query)) query = `search=${encodeURIComponent(query)}`;
    out.push({ title: title.slice(0, 80), blurb: blurb.slice(0, 160), query });
    if (out.length >= 6) break;
  }
  return out;
}

async function generateShelves(): Promise<ShelfDef[]> {
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
        { role: "user", content: LIBRARY_PROMPT },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return parseShelves(data.choices?.[0]?.message?.content ?? "");
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let shelves: ShelfDef[];
  try {
    shelves = await generateShelves();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  if (shelves.length === 0) {
    return NextResponse.json({ error: "No usable shelves generated" }, { status: 502 });
  }

  const admin = createAdminClient();
  // Replace the current global Library shelves.
  await admin
    .from("discover_shelves")
    .delete()
    .eq("surface", "library")
    .is("user_id", null);
  const { error } = await admin.from("discover_shelves").insert({
    surface: "library",
    user_id: null,
    shelves,
    generated_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, count: shelves.length, shelves });
}

export const POST = handle;
export const GET = handle;
