// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT
// Adapted from meegle-cli 51b6c92fe7bab9f830db9f4bbf2739927c434815: url_decode.go.
import { aliases, rules } from "./url-rules.js";

const segments = (path) => path.replace(/^\/+|\/+$/g, "").split("/").filter((s, i, a) => a.length !== 1 || s !== "");

function match(pattern, path) {
  const parts = segments(pattern);
  const actual = segments(path);
  const wildcard = parts.at(-1) === "*";
  const count = parts.length - Number(wildcard);
  if (wildcard ? actual.length <= count : actual.length !== count) return;
  const params = {};
  for (let i = 0; i < count; i++) {
    if (parts[i].startsWith(":")) params[parts[i].slice(1)] = actual[i];
    else if (parts[i] !== actual[i]) return;
  }
  return params;
}

export function decodeURL(raw) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("url is empty");
  let input = raw.trim();
  if (/[\u0000-\u001f\u007f\\]/u.test(input)) throw new Error("URL contains control characters or backslashes");
  if (!input.startsWith("/") && !input.includes("://")) input = `https://${input}`;
  // Preserve the original path: WHATWG URL would silently resolve dot segments.
  const parsed = /^(?:(https?):\/\/([^/?#]+))?([^?#]*)(?:\?([^#]*))?(?:#.*)?$/iu.exec(input);
  if (!parsed || (!parsed[2] && !input.startsWith("/")) || input.startsWith("//")) throw new Error("Invalid HTTP(S) URL or absolute path");
  const [, scheme, host, encodedPath, query] = parsed;
  if (host) {
    let authority;
    try { authority = new URL(`${scheme}://${host}`); } catch { throw new Error("Invalid URL host"); }
    if (authority.username || authority.password) throw new Error("URL must not contain credentials");
  }
  if (/%(?:2f|5c)/iu.test(encodedPath)) throw new Error("Ambiguous encoded path separator");
  let pathname;
  try { pathname = decodeURIComponent(encodedPath || "/"); } catch { throw new Error("Invalid URL path encoding"); }
  if (/[\u0000-\u001f\u007f\\]/u.test(pathname) || pathname.split("/").some((p) => p === "." || p === "..")) throw new Error("Ambiguous URL path");
  const result = { url_kind: "unknown", ...(host ? { host } : {}), pathname, raw };
  const entries = new URLSearchParams(query);
  if (entries.size) {
    result.query = Object.fromEntries([...new Set(entries.keys())].map((key) => [key, entries.get(key)]));
  }
  let path = pathname;
  if (path === "/meego" || path.startsWith("/meego/")) {
    path = path.slice(6) || "/";
    result.redirected_from = pathname;
  }
  for (const [pattern, target] of aliases) {
    const params = match(pattern, path);
    if (!params) continue;
    result.redirected_from ??= path;
    path = "/" + segments(target).map((s) => s.startsWith(":") ? params[s.slice(1)] : s).join("/");
    break;
  }
  for (const [pattern, kind, extras] of rules) {
    const params = match(pattern, path);
    if (!params) continue;
    result.url_kind = kind;
    for (const [key, value] of Object.entries({ ...extras, ...params })) if (value) result[key] = value;
    const resource = /^_(.+)_resource$/u.exec(result.work_item_type || "");
    if (resource) {
      result.work_item_type = resource[1];
      result.is_resource = true;
    }
    break;
  }
  return result;
}
