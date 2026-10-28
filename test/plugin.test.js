import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import plugin from "../src/index.js";

function loadTools(ctx) {
  const tools = [];
  plugin.register({ registerTool(value, options) {
    const tool = typeof value === "function" ? value(ctx) : value;
    if (tool) {
      if (options?.name) assert.equal(tool.name, options.name);
      tools.push(tool);
    }
  } });
  return tools;
}

test("OpenClaw registrations match manifest ownership and preserve official MCP OAuth", async () => {
  const manifest = JSON.parse(await readFile(new URL("../openclaw.plugin.json", import.meta.url)));
  const tools = loadTools({});
  assert.equal(plugin.id, manifest.id);
  assert.deepEqual(tools.map((tool) => tool.name).sort(), manifest.contracts.tools.toSorted());
  assert.deepEqual(manifest.mcpServers["lark-project"], { transport: "streamable-http", url: "https://project.feishu.cn/mcp_server/v1", auth: "oauth" });
  assert.deepEqual(loadTools({ sandboxed: true }).map((tool) => tool.name), ["lark-project__url_decode", "lark-project__workitem_batch_get", "lark-project__query_all"]);
});

test("registered tools execute through the OpenClaw tool signature and return structured results", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "lark-project-plugin-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "file.txt"), "hello");
  const tools = Object.fromEntries(loadTools({ workspaceDir: root, fsPolicy: { workspaceOnly: true } }).map((tool) => [tool.name, tool]));
  const decoded = await tools["lark-project__url_decode"].execute("url-1", { url: "/space/story/detail/123" });
  assert.equal(decoded.details.work_item_id, "123");
  assert.deepEqual(JSON.parse(decoded.content[0].text), decoded.details);
  const inspected = await tools["lark-project__attachment_upload"].execute("upload-1", { source_path: "file.txt" });
  assert.equal(inspected.details.status, "inspected");
  assert.equal(inspected.details.size, 5);
  assert.equal(inspected.details.mime_type, "text/plain");
  const aborted = AbortSignal.abort();
  await assert.rejects(tools["lark-project__attachment_upload"].execute("upload-2", { source_path: "file.txt" }, aborted), { name: "AbortError" });
});
