import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { pipeline } from "node:stream/promises";
import { once } from "node:events";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, writeFile, readFile, readdir, rm, symlink, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { uploadAttachment, downloadAttachment } from "../src/attachments.js";
import { requestTransfer, transferURL } from "../src/transfer-http.js";

const sign = "Fixture-Sign";
const uploadPlan = (extra = {}) => ({ upload_url: "https://files.example/upload/:part_number", sign, is_multipart: false, ...extra });
const downloadPlan = (extra = {}) => ({ download_url: "https://files.example/download/:part_number", sign, is_multipart: false, ...extra });
const context = (root) => ({ workspaceDir: root, fsPolicy: { workspaceOnly: true } });

async function fixture(t, handler) {
  const root = await mkdtemp(path.join(os.tmpdir(), "lark-project-test-"));
  await writeFile(path.join(root, "source.pdf"), "abcdefghij");
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  // Test-only transport: production still receives and validates HTTPS plans.
  const request = (url, options) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path: url.pathname + url.search, method: options.method, headers: options.headers, signal: options.signal, agent: false }, resolve);
    req.on("error", reject);
    if (options.body) pipeline(options.body, req, { signal: options.signal }).catch(reject);
    else req.end();
  });
  return { root, request, ctx: context(root) };
}

async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString(); }
const json = (res, value) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };

test("inspection uses the exact regular file and rejects stale metadata", async (t) => {
  const { root, ctx, request } = await fixture(t, () => assert.fail("inspection must not make HTTP requests"));
  const inspected = await uploadAttachment({ source_path: "source.pdf" }, ctx, { request });
  assert.equal(inspected.status, "inspected");
  assert.equal(inspected.size, 10);
  assert.equal(inspected.file_name, "source.pdf");
  assert.equal(inspected.mime_type, "application/pdf");
  await assert.rejects(uploadAttachment({ source_path: "source.png" }, ctx), /ENOENT/);
  await assert.rejects(uploadAttachment({ source_path: "." }, ctx), /regular file|not a file/);
  await writeFile(path.join(root, "empty"), "");
  await assert.rejects(uploadAttachment({ source_path: "empty" }, ctx), /regular file/);
  await writeFile(path.join(root, "source.pdf"), "changed content");
  await assert.rejects(uploadAttachment({ source_path: "source.pdf", expected_fingerprint: inspected.file_fingerprint, upload_plan: uploadPlan() }, ctx, { request }), /changed since inspection/);
});

test("display-name overrides do not change MIME inferred from the source file", async (t) => {
  const { root, ctx } = await fixture(t, () => assert.fail("inspection must stay local"));
  await writeFile(path.join(root, "source.png"), "fixture");
  for (const name of ["截图", "display.pdf"]) {
    const info = await uploadAttachment({ source_path: "source.png", file_name: name }, ctx);
    assert.equal(info.file_name, name);
    assert.equal(info.mime_type, "image/png");
  }
  const override = await uploadAttachment({ source_path: "source.png", file_name: "截图", mime_type: "image/jpeg" }, ctx);
  assert.equal(override.mime_type, "image/jpeg");
});

for (const [sourcePath, mimeType, override] of [
  ["photo.AVIF", "image/avif"],
  ["clip.WEBM", "video/webm"],
  ["data.xml", "application/xml"],
  ["json", "application/octet-stream"],
  ["photo.avif", "image/jpeg", "image/jpeg"],
]) test(`attachment MIME reaches inspection, upload headers and returned metadata: ${sourcePath}${override ? " (override)" : ""}`, async (t) => {
  const seen = [];
  const { root, ctx, request } = await fixture(t, async (req, res) => {
    seen.push({ type: req.headers["content-type"], data: await body(req) });
    json(res, { file_token: "avif-token" });
  });
  await writeFile(path.join(root, sourcePath), "fixture-bytes");
  const args = { source_path: sourcePath, file_name: "display.pdf", ...(override ? { mime_type: override } : {}) };
  const info = await uploadAttachment(args, ctx);
  assert.equal(info.mime_type, mimeType);
  const result = await uploadAttachment({ ...args, expected_fingerprint: info.file_fingerprint, upload_plan: uploadPlan() }, ctx, { request });
  assert.equal(result.mime_type, mimeType);
  assert.equal(result.name, "display.pdf");
  assert.deepEqual(seen, [{ type: mimeType, data: "fixture-bytes" }]);
});

for (const wrapped of [false, true]) test(`single upload sends raw bytes and accepts ${wrapped ? "wrapped" : "flat"} result`, async (t) => {
  const seen = [];
  const { ctx, request } = await fixture(t, async (req, res) => {
    seen.push({ method: req.method, url: req.url, headers: req.headers, data: await body(req) });
    const value = { file_token: "real-token", file_url: "opaque-file-reference", un_upload_index: [] };
    json(res, wrapped ? { code: 0, data: value } : value);
  });
  const result = await uploadAttachment({ source_path: "source.pdf", upload_plan: uploadPlan({ target_unit_code: "lane-a", authorization: "must-not-forward", cookie: "must-not-forward" }) }, ctx, { request });
  assert.equal(result.file_token, "real-token");
  assert.equal(result.name, "source.pdf");
  assert.equal(result.size, 10);
  assert.equal(seen[0].method, "POST");
  assert.equal(seen[0].url, "/upload/0");
  assert.equal(seen[0].data, "abcdefghij");
  assert.equal(seen[0].headers["content-length"], "10");
  assert.equal(seen[0].headers["content-type"], "application/pdf");
  assert.equal(seen[0].headers["x-meego-file-sign"], sign);
  assert.equal(seen[0].headers["x-target-unit"], "lane-a");
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].headers.cookie, undefined);
});

test("multipart upload honors inclusive byte ranges, final EOF and per-part routing", async (t) => {
  const seen = [];
  const { ctx, request } = await fixture(t, async (req, res) => {
    seen.push([req.url, await body(req), req.headers["x-target-unit"]]);
    json(res, req.url.endsWith("/2") ? { code: 0, data: { file_token: "final", un_upload_index: [] } } : { un_upload_index: [1, 2] });
  });
  const result = await uploadAttachment({ source_path: "source.pdf", upload_plan: uploadPlan({ is_multipart: true, target_unit_code: "lane-b", multipart: { part_count: 3, part_size: 4, need: [
    { part_index: 0, start_byte: 0, end_byte: 3 }, { part_index: 1, start_byte: 4, end_byte: 7 }, { part_index: 2, start_byte: 8, end_byte: 999 },
  ] } }) }, ctx, { request });
  assert.equal(result.file_token, "final");
  assert.deepEqual(seen, [["/upload/0", "abcd", "lane-b"], ["/upload/1", "efgh", "lane-b"], ["/upload/2", "ij", "lane-b"]]);
});

test("resumed upload only sends requested parts and uses final-part token", async (t) => {
  const { ctx, request } = await fixture(t, async (req, res) => {
    assert.equal(req.url, "/upload/2"); assert.equal(await body(req), "ij");
    json(res, { file_token: "resumed" });
  });
  const result = await uploadAttachment({ source_path: "source.pdf", upload_plan: uploadPlan({ is_multipart: true, multipart: { part_count: 3, need: [{ part_index: 2, start_byte: 8, end_byte: 0 }] } }) }, ctx, { request });
  assert.equal(result.file_token, "resumed");
});

for (const [label, result, message, status = 200] of [
  ["business error", { code: 401, msg: "signature-secret" }, /business error/],
  ["missing token", {}, /without a file_token/],
  ["incomplete", { file_token: "false-success", un_upload_index: [1] }, /incomplete/],
  ["HTTP error", {}, /HTTP 403/, 403],
]) test(`upload rejects ${label}`, async (t) => {
  const { ctx, request } = await fixture(t, async (req, res) => { await body(req); res.statusCode = status; json(res, result); });
  await assert.rejects(uploadAttachment({ source_path: "source.pdf", upload_plan: uploadPlan() }, ctx, { request }), message);
});

test("invalid multipart upload plans fail before network activity", async (t) => {
  const { ctx, request } = await fixture(t, () => assert.fail("must validate all ranges before upload"));
  for (const need of [[], [{ part_index: 0, start_byte: 0, end_byte: 3 }], [{ part_index: 1, start_byte: 20, end_byte: 99 }], [{ part_index: 0, start_byte: 0, end_byte: 9 }, { part_index: 1, start_byte: 5, end_byte: 0 }], [{ part_index: 1, start_byte: 8, end_byte: 9 }, { part_index: 1, start_byte: 8, end_byte: 9 }]]) {
    await assert.rejects(uploadAttachment({ source_path: "source.pdf", upload_plan: uploadPlan({ is_multipart: true, multipart: { part_count: 2, need } }) }, ctx, { request }), /part|range/);
  }
});

test("download concatenates parts, verifies signatures, routes every part and commits atomically", async (t) => {
  const seen = [];
  const { root, ctx, request } = await fixture(t, (req, res) => {
    seen.push(req.url);
    assert.equal(req.headers["x-target-unit"], "lane-c");
    assert.equal(req.headers.authorization, undefined);
    res.setHeader("x-meego-file-sign", "fixture-sign");
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf");
    res.end(req.url.endsWith("/0") ? "abcdef" : "ghij");
  });
  const result = await downloadAttachment({ output_path: "saved.pdf", download_plan: downloadPlan({ is_multipart: true, target_unit_code: "lane-c", multipart: { part_count: 2, part_size: 6 } }) }, ctx, { request });
  assert.equal(await readFile(path.join(root, "saved.pdf"), "utf8"), "abcdefghij");
  assert.equal(result.size, 10);
  assert.equal(result.name, "报告.pdf");
  assert.equal(result.mime_type, "application/pdf");
  assert.deepEqual(seen, ["/download/0", "/download/1"]);
  assert.deepEqual((await readdir(root)).sort(), ["saved.pdf", "source.pdf"]);
  assert.equal((await stat(result.path)).mode & 0o777, 0o600);
});

test("download rejects existing file before HTTP; explicit overwrite replaces only after success", async (t) => {
  let calls = 0;
  const { root, ctx, request } = await fixture(t, (req, res) => { calls++; res.setHeader("x-meego-file-sign", sign); res.end("replacement"); });
  await writeFile(path.join(root, "saved"), "original");
  await assert.rejects(downloadAttachment({ output_path: "saved", download_plan: downloadPlan() }, ctx, { request }), /already exists/);
  assert.equal(calls, 0);
  await downloadAttachment({ output_path: "saved", overwrite: true, download_plan: downloadPlan() }, ctx, { request });
  assert.equal(await readFile(path.join(root, "saved"), "utf8"), "replacement");
});

for (const badSign of [undefined, "wrong-sign"]) test(`download fails closed on ${badSign ? "wrong" : "missing"} response signature`, async (t) => {
  const { root, ctx, request } = await fixture(t, (req, res) => { if (badSign) res.setHeader("x-meego-file-sign", badSign); res.end("invalid-file"); });
  await writeFile(path.join(root, "saved"), "original");
  await assert.rejects(downloadAttachment({ output_path: "saved", overwrite: true, download_plan: downloadPlan() }, ctx, { request }), /signature/);
  assert.equal(await readFile(path.join(root, "saved"), "utf8"), "original");
  assert.deepEqual((await readdir(root)).sort(), ["saved", "source.pdf"]);
});

test("download cleans partial files on second-part HTTP error", async (t) => {
  const { root, ctx, request } = await fixture(t, (req, res) => { res.setHeader("x-meego-file-sign", sign); res.statusCode = req.url.endsWith("/1") ? 503 : 200; res.end("partial"); });
  await assert.rejects(downloadAttachment({ output_path: "saved", download_plan: downloadPlan({ is_multipart: true, multipart: { part_count: 2 } }) }, ctx, { request }), /HTTP 503/);
  assert.deepEqual(await readdir(root), ["source.pdf"]);
});

test("download cleanup on truncated body or cancellation leaves no destination", async (t) => {
  for (const abort of [false, true]) {
    const controller = new AbortController();
    const { root, ctx, request } = await fixture(t, (req, res) => {
      res.setHeader("x-meego-file-sign", sign); res.setHeader("content-length", "100"); res.write("short");
      setImmediate(() => abort ? controller.abort() : res.destroy());
    });
    await assert.rejects(downloadAttachment({ output_path: "saved", download_plan: downloadPlan() }, ctx, { request, signal: controller.signal }));
    assert.deepEqual(await readdir(root), ["source.pdf"]);
  }
});

test("an output created during download is never overwritten by default", async (t) => {
  const { root, ctx, request } = await fixture(t, async (req, res) => {
    await writeFile(path.join(root, "saved"), "concurrent-writer");
    res.setHeader("x-meego-file-sign", sign); res.end("download");
  });
  await assert.rejects(downloadAttachment({ output_path: "saved", download_plan: downloadPlan() }, ctx, { request }), /already exists|EEXIST/);
  assert.equal(await readFile(path.join(root, "saved"), "utf8"), "concurrent-writer");
  assert.deepEqual((await readdir(root)).sort(), ["saved", "source.pdf"]);
});

test("workspace and sandbox policies apply to canonical source and output paths", async (t) => {
  const { root, ctx, request } = await fixture(t, () => assert.fail("no network allowed"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "lark-project-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(path.join(outside, "file"), "outside");
  await symlink(outside, path.join(root, "escape"));
  await assert.rejects(uploadAttachment({ source_path: "escape/file" }, ctx), /outside/);
  await assert.rejects(downloadAttachment({ output_path: "escape/saved", download_plan: downloadPlan() }, ctx, { request }), /outside/);
  await symlink(path.join(root, "source.pdf"), path.join(root, "saved"));
  await assert.rejects(downloadAttachment({ output_path: "saved", overwrite: true, download_plan: downloadPlan() }, ctx, { request }), /symlink/);
  await assert.rejects(uploadAttachment({ source_path: "source.pdf" }, { ...ctx, sandboxed: true }), /sandboxed/);
});

test("upload validates the opened file when a parent changes after path validation", async (t) => {
  const { root, ctx, request } = await fixture(t, () => assert.fail("no outside file may be uploaded"));
  const canonical = await fs.realpath(root);
  const parent = path.join(canonical, "inside");
  const outside = await mkdtemp(path.join(os.tmpdir(), "lark-project-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await fs.mkdir(parent);
  await writeFile(path.join(parent, "file"), "allowed");
  await writeFile(path.join(outside, "file"), "outside");
  const originalOpen = fs.open;
  let swapped = false;
  t.mock.method(fs, "open", async (file, ...options) => {
    if (!swapped && file === path.join(parent, "file")) {
      swapped = true;
      await fs.rename(parent, path.join(canonical, "original"));
      await symlink(outside, parent);
    }
    return originalOpen(file, ...options);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  await assert.rejects(uploadAttachment({ source_path: "inside/file", upload_plan: uploadPlan() }, ctx, { request }));
  assert.equal(swapped, true);
});

test("download uses the host boundary when its destination parent changes during transfer", async (t) => {
  const { root, ctx, request } = await fixture(t, (_req, res) => { res.setHeader("x-meego-file-sign", sign); res.end("downloaded"); });
  const parent = path.join(root, "inside");
  const outside = await mkdtemp(path.join(os.tmpdir(), "lark-project-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await fs.mkdir(parent);
  await writeFile(path.join(parent, "saved"), "original");
  await writeFile(path.join(outside, "saved"), "outside-original");
  const swapThenRequest = async (...args) => {
    await fs.rename(parent, path.join(root, "original"));
    await symlink(outside, parent);
    return request(...args);
  };
  await assert.rejects(downloadAttachment({ output_path: "inside/saved", overwrite: true, download_plan: downloadPlan() }, ctx, { request: swapThenRequest }));
  assert.equal(await readFile(path.join(outside, "saved"), "utf8"), "outside-original");
  assert.deepEqual(await readdir(outside), ["saved"]);
  assert.equal(await readFile(path.join(root, "original", "saved"), "utf8"), "original");
});

test("safe source opening permits internal symlinks and rejects hardlinks", async (t) => {
  const { root, ctx } = await fixture(t, () => assert.fail("inspection makes no requests"));
  await symlink(path.join(root, "source.pdf"), path.join(root, "alias.pdf"));
  assert.equal((await uploadAttachment({ source_path: "alias.pdf" }, ctx)).size, 10);
  await fs.link(path.join(root, "source.pdf"), path.join(root, "hardlink.pdf"));
  await assert.rejects(uploadAttachment({ source_path: "hardlink.pdf" }, ctx), /hardlink/);
});

test("session policy root overrides workspaceDir for relative reads and downloads", async (t) => {
  const { root, request } = await fixture(t, (_req, res) => { res.setHeader("x-meego-file-sign", sign); res.end("session-file"); });
  const sessionRoot = path.join(root, "session");
  await fs.mkdir(sessionRoot);
  await writeFile(path.join(sessionRoot, "source.pdf"), "session-source");
  const ctx = { workspaceDir: root, fsPolicy: { workspaceOnly: true, root: sessionRoot } };
  const inspected = await uploadAttachment({ source_path: "source.pdf" }, ctx);
  assert.equal(inspected.size, 14);
  await assert.rejects(uploadAttachment({ source_path: path.join(root, "source.pdf") }, ctx), /outside/);
  const downloaded = await downloadAttachment({ output_path: "saved", download_plan: downloadPlan() }, ctx, { request });
  assert.equal(downloaded.path, path.join(await fs.realpath(sessionRoot), "saved"));
  assert.equal(await readFile(downloaded.path, "utf8"), "session-file");
  assert.equal((await uploadAttachment({ source_path: "source.pdf" }, { fsPolicy: ctx.fsPolicy })).size, 14);
});

test("host-authorized additional roots permit uploads but never grant download writes", async (t) => {
  const { root, request } = await fixture(t, () => assert.fail("no download request allowed"));
  const sessionRoot = path.join(root, "session"), attachmentsRoot = path.join(root, "attachments");
  await fs.mkdir(sessionRoot);
  await fs.mkdir(attachmentsRoot);
  const source = path.join(attachmentsRoot, "source.pdf");
  await writeFile(source, "attached");
  const ctx = { workspaceDir: root, fsPolicy: { workspaceOnly: true, root: sessionRoot, readOnlyRoots: [attachmentsRoot] } };
  assert.equal((await uploadAttachment({ source_path: source }, ctx)).size, 8);
  await assert.rejects(downloadAttachment({ output_path: path.join(attachmentsRoot, "saved"), download_plan: downloadPlan() }, ctx, { request }), /outside/);
  await assert.rejects(uploadAttachment({ source_path: path.join(root, "source.pdf") }, ctx), /outside/);
});

test("revoked invocation cannot upload or publish a downloaded file", async (t) => {
  const { root, ctx, request } = await fixture(t, (_req, res) => { res.setHeader("x-meego-file-sign", sign); res.end("replacement"); });
  let current = false;
  ctx.assertInvocationCurrent = () => { if (!current) throw new Error("invocation retired"); };
  await assert.rejects(uploadAttachment({ source_path: "source.pdf", upload_plan: uploadPlan() }, ctx, { request }), /invocation retired/);
  await writeFile(path.join(root, "saved"), "original");
  current = true;
  const retireAfterResponse = async (...args) => {
    const response = await request(...args);
    current = false;
    return response;
  };
  await assert.rejects(downloadAttachment({ output_path: "saved", overwrite: true, download_plan: downloadPlan() }, ctx, { request: retireAfterResponse }), /invocation retired/);
  assert.equal(await readFile(path.join(root, "saved"), "utf8"), "original");
  assert.deepEqual((await readdir(root)).sort(), ["saved", "source.pdf"]);
});

test("transfer URLs reject HTTP, embedded credentials and fragments", () => {
  for (const template of ["http://files.example/file", "https://u:p@files.example/file", "https://files.example/file#fragment"]) assert.throws(() => transferURL(template, 0), /HTTPS/);
});

const hasHostSdk = await import("openclaw/plugin-sdk/security-runtime").then(() => true, () => false);
test("production transport uses the OpenClaw guard to reject private networks", { skip: !hasHostSdk && "OpenClaw host SDK is not installed in this standalone checkout" }, async () => {
  for (const host of ["127.0.0.1", "[::1]", "169.254.169.254", "localhost"]) {
    await assert.rejects(requestTransfer(new URL(`https://${host}/file`), { method: "GET", headers: {}, signal: AbortSignal.timeout(5000) }), /permitted public address/);
  }
});
