import https from "node:https";
import { pipeline } from "node:stream/promises";

export function transferURL(template, part) {
  if (typeof template !== "string") throw new Error("Transfer plan is missing its URL");
  let url;
  try { url = new URL(template.replaceAll(":part_number", String(part))); } catch { throw new Error("Invalid transfer URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Transfer URL must use HTTPS without credentials or fragment");
  return url;
}

// Use the host's public-network guard and pin its checked DNS result to the TLS
// connection. No redirects, cookies, bearer tokens, or ambient proxy credentials.
export async function requestTransfer(url, { method, headers, body, signal, assertCurrent }) {
  signal?.throwIfAborted();
  assertCurrent?.();
  const { resolvePinnedHostnameWithPolicy } = await import("openclaw/plugin-sdk/security-runtime");
  let pinned;
  try { pinned = await resolvePinnedHostnameWithPolicy(url.hostname.replace(/^\[|\]$/g, "")); }
  catch { throw new Error("Transfer host could not be resolved to a permitted public address"); }
  signal?.throwIfAborted();
  assertCurrent?.();
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, signal, lookup: pinned.lookup, agent: false }, resolve);
    req.once("error", (error) => reject(new Error(`Attachment HTTP request failed (${error.code || "network error"})`)));
    req.setTimeout(120_000, () => req.destroy(new Error("Attachment HTTP request timed out")));
    if (body) pipeline(body, req, { signal }).catch((error) => req.destroy(error));
    else req.end();
  });
}
