// TEMPORARY DIAGNOSTIC — delete once the cron auth is confirmed working.
// Reports whether the running deployment can see CRON_SECRET and whether the
// token you sent matches it. Never returns the secret itself — only booleans
// and lengths, which is enough to spot a missing var, a typo, or stray
// whitespace from pasting.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  return NextResponse.json({
    serverHasSecret: Boolean(secret),
    serverSecretLength: secret.length,
    serverSecretTrimmedLength: secret.trim().length,
    receivedAuthHeader: Boolean(header),
    receivedTokenLength: token.length,
    matches: Boolean(secret) && token === secret,
    matchesIfTrimmed: Boolean(secret) && token.trim() === secret.trim(),
  });
}
