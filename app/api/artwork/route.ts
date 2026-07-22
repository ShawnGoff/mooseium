// GET /api/artwork?museum=met&objectId=436535
// Full details for one piece, for the placard when opened from search results
// (search cards only carry partial data).

import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/museums";
import { checkRateLimit } from "@/lib/rate-limit";
import { cleanProse, decodeEntities } from "@/lib/util/text";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "artwork", 90, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const museum = searchParams.get("museum") ?? "";
  const objectId = searchParams.get("objectId") ?? "";

  const adapter = getAdapter(museum);
  if (!adapter || !objectId) {
    return NextResponse.json({ error: "Unknown artwork." }, { status: 400 });
  }

  try {
    const art = await adapter.getObject(objectId);
    // Display image is capped ~800px so the hero/placard load fast; full-res is
    // reserved for the zoom lightbox.
    const image = adapter.getImageUrl(art, 800) || art.sourceImageUrl || "";
    const imageFull =
      adapter.getImageUrl(art, 2048) || art.sourceImageUrl || image;
    return NextResponse.json({
      artwork: {
        title: decodeEntities(art.title),
        artist: decodeEntities(art.artist),
        dateText: decodeEntities(art.dateText),
        medium: decodeEntities(art.medium),
        culture: decodeEntities(art.culture),
        dimensions: decodeEntities(art.dimensions),
        objectType: decodeEntities(art.objectType),
        description: cleanProse(art.description),
        creditLine: decodeEntities(art.creditLine),
        license: art.rights.license,
        details: (art.details ?? []).map((d) => ({
          label: decodeEntities(d.label),
          value: cleanProse(d.value),
        })),
        provenance: cleanProse(art.provenance),
        funFact: cleanProse(art.funFact),
        artistBio: cleanProse(art.artistBio),
        exhibitions: (art.exhibitions ?? []).map((e) => cleanProse(e)),
        onView: decodeEntities(art.onView),
        additionalImages: art.additionalImages ?? [],
        tags: art.tags,
        sourceMuseum: art.sourceMuseum,
        sourceUrl: art.sourceUrl,
        image,
        imageFull,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load that artwork." },
      { status: 502 }
    );
  }
}
