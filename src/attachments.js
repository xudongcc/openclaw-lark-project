// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT
// Adapted from meegle-cli 51b6c92fe7bab9f830db9f4bbf2739927c434815:
// internal/products/meegle/attachment/{upload,download,types}.go.
import { open, realpath, lstat, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { requestTransfer, transferURL } from "./transfer-http.js";
import { defaultContentType } from "./mime-type.js";

const SIGN = "x-meego-file-sign";

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${name} must be a nonempty string without control characters`);
  return value;
}

function integer(value, name, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${name} must be a safe integer >= ${min}`);
  return value;
}

function fingerprint(stat) {
  return createHash("sha256").update([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(":")).digest("hex");
}

function within(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function filePath(input, ctx, writing = false) {
  if (ctx.sandboxed) throw new Error("Native attachment tools cannot access host files from a sandboxed session");
  ctx.assertInvocationCurrent?.();
  const policyRoot = ctx.fsPolicy?.root ?? ctx.workspaceDir;
  const resolved = path.resolve(policyRoot || process.cwd(), requireString(input, writing ? "output_path" : "source_path"));
  if (ctx.fsPolicy?.workspaceOnly && !policyRoot) throw new Error("Workspace-only policy requires a workspace directory");
  // Capture the boundary before resolving the target. The SDK validates opened
  // file identities and anchors mutations to the root; path checks alone race.
  const { root: safeRoot } = await import("openclaw/plugin-sdk/security-runtime");
  const roots = ctx.fsPolicy?.workspaceOnly ? [policyRoot, ...(!writing ? ctx.fsPolicy.readOnlyRoots ?? [] : [])] : [];
  const boundaries = await Promise.all(roots.map((directory) => safeRoot(directory)));
  const canonical = writing ? path.join(await realpath(path.dirname(resolved)), path.basename(resolved)) : await realpath(resolved);
  let boundary;
  if (ctx.fsPolicy?.workspaceOnly) {
    boundary = boundaries.find((candidate) => within(candidate.rootReal, canonical));
    if (!boundary || !boundaries.some((candidate, index) => within(path.resolve(roots[index]), resolved) || within(candidate.rootReal, resolved))) {
      throw new Error("File path is outside the permitted workspace or host-authorized read roots");
    }
  }
  boundary ??= await safeRoot(path.dirname(canonical));
  return { root: boundary, relative: path.relative(boundary.rootReal, canonical), path: canonical };
}

async function sourceFile(args, ctx) {
  const source = await filePath(args.source_path, ctx);
  ctx.assertInvocationCurrent?.();
  const { handle: file, realPath } = await source.root.open(source.relative, { hardlinks: "reject", symlinks: "follow-within-root" });
  try {
    const stat = await file.stat();
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0) throw new Error("Source must be a nonempty regular file with a safe byte size");
    const fileName = args.file_name ?? path.basename(args.source_path);
    requireString(fileName, "file_name");
    if (fileName === "." || fileName === ".." || /[/\\]/u.test(fileName)) throw new Error("file_name must be a basename");
    const mimeType = args.mime_type ?? defaultContentType(args.source_path);
    if (typeof mimeType !== "string" || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/u.test(mimeType)) throw new Error("mime_type must be a media type without parameters");
    const info = { source_path: realPath, file_name: fileName, size: stat.size, mime_type: mimeType, file_fingerprint: fingerprint(stat) };
    if (args.expected_fingerprint !== undefined && args.expected_fingerprint !== info.file_fingerprint) throw new Error("Source file changed since inspection; obtain a new upload plan");
    return { file, info };
  } catch (error) { await file.close(); throw error; }
}

function planOf(value, kind) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${kind}_plan must be the business object returned by MCP`);
  if (value.code !== undefined && value.code !== 0) throw new Error("MCP transfer plan reports a business error");
  const plan = value.data ?? value;
  requireString(plan.sign, "plan.sign");
  if (typeof plan.is_multipart !== "boolean") throw new Error("plan.is_multipart must be a boolean");
  transferURL(plan[`${kind}_url`], 0);
  if (plan.target_unit_code !== undefined && plan.target_unit_code !== "") requireString(plan.target_unit_code, "plan.target_unit_code");
  if (plan.is_multipart) {
    integer(plan.multipart?.part_count, "multipart.part_count", 1);
    if (plan.multipart.part_count > 100_000) throw new Error("Transfer plan contains too many parts");
    if (!plan[`${kind}_url`].includes(":part_number") && plan.multipart.part_count > 1) throw new Error("Multipart URL must contain :part_number");
  }
  return plan;
}

function headersFor(plan) {
  return { [SIGN]: plan.sign, ...(plan.target_unit_code ? { "x-target-unit": plan.target_unit_code } : {}) };
}

function chunksFor(plan, size) {
  if (!plan.is_multipart) return [{ part_index: 0, start_byte: 0, end_byte: size - 1 }];
  const { part_count: count, need } = plan.multipart;
  if (!Array.isArray(need) || !need.length) throw new Error("multipart.need must contain the requested upload parts");
  const seen = new Set();
  const chunks = need.map((chunk) => {
    const index = integer(chunk.part_index, "part_index");
    const start = integer(chunk.start_byte, "start_byte");
    // Official protocol: final part extends to EOF; its end_byte can be stale.
    const end = index === count - 1 ? size - 1 : integer(chunk.end_byte, "end_byte");
    if (index >= count || seen.has(index) || start > end || end >= size) throw new Error("Invalid or duplicate upload part range");
    seen.add(index);
    return { part_index: index, start_byte: start, end_byte: end };
  });
  if (!seen.has(count - 1)) throw new Error("Upload plan is missing the final part");
  const ordered = [...chunks].sort((a, b) => a.start_byte - b.start_byte);
  if (ordered.some((c, i) => i && c.start_byte <= ordered[i - 1].end_byte)) throw new Error("Upload part ranges overlap");
  return chunks;
}

async function partResult(response, signal) {
  let size = 0;
  const buffers = [];
  for await (const chunk of response) {
    signal.throwIfAborted();
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Upload response exceeds 1 MiB");
    buffers.push(chunk);
  }
  let payload;
  try { payload = JSON.parse(Buffer.concat(buffers).toString("utf8")); } catch { throw new Error("Upload returned invalid JSON"); }
  if (!payload || typeof payload !== "object" || (payload.code !== undefined && payload.code !== 0)) throw new Error("Upload returned a business error");
  payload = payload.data ?? payload;
  if (!payload || typeof payload !== "object") throw new Error("Upload response is missing its business result");
  if (payload.un_upload_index !== undefined && !Array.isArray(payload.un_upload_index)) throw new Error("Invalid un_upload_index in upload response");
  return payload;
}

function transferSignal(signal) {
  const timeout = AbortSignal.timeout(10 * 60 * 1000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function* fileRange(file, start, end, signal, assertCurrent) {
  for (let position = start; position <= end;) {
    signal.throwIfAborted();
    assertCurrent?.();
    const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, end - position + 1));
    const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
    if (!bytesRead) throw new Error("Source file ended before its declared upload size");
    position += bytesRead;
    yield buffer.subarray(0, bytesRead);
  }
}

export async function uploadAttachment(args, ctx = {}, { request = requestTransfer, signal } = {}) {
  signal = transferSignal(signal);
  signal.throwIfAborted();
  const { file, info } = await sourceFile(args, ctx);
  try {
    if (args.upload_plan === undefined) return { status: "inspected", ...info };
    const plan = planOf(args.upload_plan, "upload");
    const chunks = chunksFor(plan, info.size);
    let final;
    for (const part of chunks) {
      signal.throwIfAborted();
      ctx.assertInvocationCurrent?.();
      if (fingerprint(await file.stat()) !== info.file_fingerprint) throw new Error("Source file changed during upload");
      const body = Readable.from(fileRange(file, part.start_byte, part.end_byte, signal, ctx.assertInvocationCurrent));
      let response;
      try {
        ctx.assertInvocationCurrent?.();
        response = await request(transferURL(plan.upload_url, part.part_index), {
          method: "POST", headers: { ...headersFor(plan), "content-type": info.mime_type, "content-length": String(part.end_byte - part.start_byte + 1) }, body, signal, assertCurrent: ctx.assertInvocationCurrent,
        });
        if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Upload HTTP ${response.statusCode}`);
        const result = await partResult(response, signal);
        if (!plan.is_multipart || part.part_index === plan.multipart.part_count - 1) {
          if (result.un_upload_index?.length) throw new Error("Upload is incomplete: un_upload_index is nonempty");
          final = result;
        }
      } finally { body.destroy(); response?.destroy(); }
    }
    signal.throwIfAborted();
    if (fingerprint(await file.stat()) !== info.file_fingerprint) throw new Error("Source file changed during upload");
    if (typeof final?.file_token !== "string" || !final.file_token.trim()) throw new Error("Upload completed without a file_token");
    return { status: "uploaded", file_token: final.file_token, file_url: final.file_url || "", name: info.file_name, size: info.size, mime_type: info.mime_type };
  } finally { await file.close(); }
}

async function checkOutput(output, overwrite) {
  let stat;
  try { stat = await lstat(output.path); } catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (!overwrite) throw new Error("Output file already exists; overwrite must be explicitly enabled to replace it");
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Output must be a regular file, not a symlink or directory");
}

function filenameFromHeader(value) {
  if (typeof value !== "string") return "";
  const extended = /(?:^|;)\s*filename\*=UTF-8'[^']*'([^;]*)/iu.exec(value);
  if (extended) { try { return decodeURIComponent(extended[1].trim()); } catch { return ""; } }
  const ordinary = /(?:^|;)\s*filename=(?:"((?:[^"\\]|\\.)*)"|([^;]*))/iu.exec(value);
  return ordinary ? (ordinary[1]?.replace(/\\(.)/gu, "$1") ?? ordinary[2].trim()) : "";
}

export async function downloadAttachment(args, ctx = {}, { request = requestTransfer, signal } = {}) {
  signal = transferSignal(signal);
  signal.throwIfAborted();
  if (args.overwrite !== undefined && typeof args.overwrite !== "boolean") throw new Error("overwrite must be a boolean");
  const plan = planOf(args.download_plan, "download");
  const output = await filePath(args.output_path, ctx, true);
  await checkOutput(output, args.overwrite === true);
  // Stream outside the mutable workspace tree, then let the host publish the
  // complete file with its overwrite policy and final mutation guard.
  const privateDir = await mkdtemp(path.join(os.tmpdir(), "lark-project-download-"));
  const temporary = path.join(privateDir, "download");
  let sink;
  let size = 0, name = "", mimeType = "";
  try {
    sink = await open(temporary, "wx", 0o600);
    const count = plan.is_multipart ? plan.multipart.part_count : 1;
    for (let part = 0; part < count; part++) {
      signal.throwIfAborted();
      ctx.assertInvocationCurrent?.();
      const response = await request(transferURL(plan.download_url, part), { method: "GET", headers: headersFor(plan), signal, assertCurrent: ctx.assertInvocationCurrent });
      try {
        if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`Download HTTP ${response.statusCode}`);
        const sign = response.headers[SIGN];
        if (typeof sign !== "string" || !sign.trim()) throw new Error("Download response is missing its file signature");
        if (sign.trim().toLowerCase() !== plan.sign.toLowerCase()) throw new Error("Download response file signature does not match");
        name ||= filenameFromHeader(response.headers["content-disposition"]);
        mimeType ||= response.headers["content-type"] || "";
        for await (const chunk of response) {
          signal.throwIfAborted();
          ctx.assertInvocationCurrent?.();
          // FileHandle.write can perform a short write; finish each buffer.
          let offset = 0;
          while (offset < chunk.length) {
            const { bytesWritten } = await sink.write(chunk, offset, chunk.length - offset);
            if (!bytesWritten) throw new Error("Download file write made no progress");
            offset += bytesWritten;
          }
          size += chunk.length;
        }
      } finally { response.destroy(); }
    }
    signal.throwIfAborted();
    await sink.sync();
    await sink.close();
    await checkOutput(output, args.overwrite === true);
    signal.throwIfAborted();
    await output.root.copyIn(output.relative, temporary, {
      mkdir: false, mode: 0o600, sourceHardlinks: "reject", overwrite: args.overwrite === true, signal,
      assertBeforeMutation: () => { signal.throwIfAborted(); ctx.assertInvocationCurrent?.(); },
    });
    return { status: "downloaded", path: output.path, size, ...(name ? { name } : {}), ...(mimeType ? { mime_type: mimeType } : {}) };
  } finally {
    await sink?.close().catch(() => {});
    await rm(privateDir, { recursive: true, force: true });
  }
}
