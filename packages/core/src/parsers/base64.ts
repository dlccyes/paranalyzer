/** Decode a base64 string in any JS runtime (browser, Node, Deno). */
export function decodeBase64(b64: string): string {
  if (typeof atob === "function") return atob(b64);
  // Node.js 18+ / other runtimes without global atob:
  return Buffer.from(b64, "base64").toString("binary");
}
