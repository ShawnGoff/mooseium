// Some museum feeds return HTML/XML character entities in text fields — and a
// few double-encode them (e.g. "&amp;#233;"). Decode named + numeric refs so
// titles read as "Française", not "Fran&#231;aise". Two passes clears the
// double-encoded cases.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeOnce(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => NAMED[e] ?? `&${e};`);
}

export function decodeEntities<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return decodeOnce(decodeOnce(value)) as T;
}

/**
 * Strip HTML tags some museum feeds leave in prose fields, so descriptions
 * don't render as literal "<em>Two Poplars</em>". Collapses the double spaces
 * a removed tag can leave behind, but preserves line breaks.
 */
export function stripHtml<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return value
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim() as T;
}

/** For prose fields: decode entities first (so "&lt;em&gt;" becomes a real tag), then strip. */
export function cleanProse<T extends string | null | undefined>(value: T): T {
  return stripHtml(decodeEntities(value));
}
