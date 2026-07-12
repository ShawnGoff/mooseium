// Serialize a JSON-LD object for safe embedding in a <script> tag.
// JSON.stringify does NOT escape <, >, or & — so user-controlled fields (gallery
// names, bios, display names, artist strings) could otherwise close the <script>
// early and inject markup (stored XSS). Escaping these three code points keeps
// the JSON valid while making script-breakout impossible.
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
