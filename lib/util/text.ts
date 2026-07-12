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
