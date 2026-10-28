import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createMcpReadClient, loadHostMcpModule, unwrapMcpResult } from "../src/mcp-read-client.js";

const result = (data) => ({ content: [{ type: "text", text: JSON.stringify({ code: 0, data }) }] });

test("MCP results unwrap structured/text envelopes and reject business or protocol errors", () => {
  assert.deepEqual(unwrapMcpResult(result({ name: "workitem" })), { name: "workitem" });
  assert.deepEqual(unwrapMcpResult({ structuredContent: { code: 0, data: [1] } }), [1]);
  for (const value of [{ code: 123, msg: "sensitive error" }, { error_code: 456 }, { inner_err: "backend failure" }]) assert.throws(() => unwrapMcpResult(result(value)), { code: "MCP_READ_FAILED" });
  assert.throws(() => unwrapMcpResult({ isError: true, content: [{ type: "text", text: "OAuth authentication required: token=secret" }] }), { code: "AUTH_REQUIRED" });
  assert.throws(() => unwrapMcpResult({ content: [{ type: "text", text: "not JSON" }] }), { code: "INVALID_MCP_RESULT" });
  assert.deepEqual(unwrapMcpResult({ content: [{ type: "text", text: 'log_id: fixture-trace' }, { type: "text", text: '{"id":900719925474099312345}' }] }), { id: "900719925474099312345" });
  assert.throws(() => unwrapMcpResult({ structuredContent: { id: 900719925474099312345 } }), { code: "INVALID_MCP_RESULT" });
});

function hostFixture(overrides = {}) {
  let calls = [], leases = 0;
  const runtime = {
    sessionId: "s", markUsed() {},
    peekCatalog: () => ({ tools: [{ serverName: "lark-project", toolName: "get_workitem_brief", inputSchema: { type: "object" } }], servers: { "lark-project": { supportsParallelToolCalls: true } } }),
    acquireLease() { leases++; return () => leases--; },
    async callTool(server, name, args) { calls.push({ server, name, args }); return result({ id: args.work_item_id }); },
    ...overrides,
  };
  return {
    runtime, calls, leases: () => leases,
    loadHost: async () => ({ peekSessionMcpRuntime: () => runtime, validateJsonSchemaValue: ({ value }) => ({ ok: typeof value.work_item_id === "string" }) }),
  };
}

test("bridge reuses only the current session, enforces visible read tools and live input validation", async () => {
  const fixture = hostFixture();
  const client = await createMcpReadClient({ sessionId: "s" }, fixture);
  assert.equal(client.concurrency, 3);
  assert.deepEqual(await client.call("get_workitem_brief", { work_item_id: "9007199254740993123" }), { id: "9007199254740993123" });
  assert.deepEqual(fixture.calls[0], { server: "lark-project", name: "get_workitem_brief", args: { work_item_id: "9007199254740993123" } });
  assert.equal(fixture.leases(), 0);
  await assert.rejects(client.call("get_workitem_brief", { work_item_id: 1 }), { code: "INVALID_MCP_ARGUMENTS" });
  await assert.rejects(client.call("update_field", { work_item_id: "1" }), { code: "MCP_TOOL_UNAVAILABLE" });
  await assert.rejects(client.call("search_by_mql", {}), { code: "MCP_TOOL_UNAVAILABLE" });
  assert.equal(fixture.calls.length, 1);
  await assert.rejects(createMcpReadClient({ sessionId: "other" }, fixture), { code: "MCP_SESSION_REQUIRED" });
  await assert.rejects(createMcpReadClient({}, fixture), { code: "MCP_SESSION_REQUIRED" });
});

test("bridge fails closed when the session catalog is absent", async () => {
  await assert.rejects(createMcpReadClient({ sessionId: "s" }, hostFixture({ peekCatalog: () => null })), { code: "MCP_CATALOG_REQUIRED" });
});

test("bridge honors catalog visibility and rechecks it before each call", async () => {
  const entry = { serverName: "lark-project", toolName: "get_workitem_brief", inputSchema: { type: "object" } };
  for (const flags of [{ deniedBySession: true }, { excludedFromOpenClawCatalog: true }, { uiVisibility: ["app"] }, { oauthConnectBootstrap: true }]) {
    const fixture = hostFixture({ peekCatalog: () => ({ tools: [{ ...entry, ...flags }], servers: {} }) });
    const client = await createMcpReadClient({ sessionId: "s" }, fixture);
    await assert.rejects(client.call("get_workitem_brief", { work_item_id: "1" }), { code: "MCP_TOOL_UNAVAILABLE" });
    assert.equal(fixture.calls.length, 0);
  }
  const catalog = { tools: [{ ...entry }], servers: { "lark-project": {} } };
  const fixture = hostFixture({ peekCatalog: () => catalog });
  const client = await createMcpReadClient({ sessionId: "s" }, fixture);
  await client.call("get_workitem_brief", { work_item_id: "1" });
  catalog.servers["lark-project"].deniedToolNames = ["get_workitem_brief"];
  await assert.rejects(client.call("get_workitem_brief", { work_item_id: "2" }), { code: "MCP_TOOL_UNAVAILABLE" });
  assert.equal(fixture.calls.length, 1);
});

test("bridge refuses changed sessions and mismatched requester-scoped connections", async () => {
  const scope = { requesterSenderId: "user-a", messageChannel: "feishu", agentAccountId: "account-a" };
  const fixture = hostFixture({ requesterScope: scope, isRequesterScopedServer: () => true });
  await assert.rejects(createMcpReadClient({ sessionId: "s", ...scope, requesterSenderId: "user-b" }, fixture), { code: "MCP_SESSION_REQUIRED" });
  const client = await createMcpReadClient({ sessionId: "s", ...scope }, fixture);
  assert.deepEqual(await client.call("get_workitem_brief", { work_item_id: "1" }), { id: "1" });
  await assert.rejects(createMcpReadClient({ sessionId: "s" }, hostFixture({ isRequesterScopedServer: () => true })), { code: "MCP_SESSION_REQUIRED" });
  let current = fixture.runtime;
  const host = await fixture.loadHost();
  host.peekSessionMcpRuntime = () => current;
  const bound = await createMcpReadClient({ sessionId: "s", ...scope }, { loadHost: async () => host });
  current = { ...fixture.runtime };
  await assert.rejects(bound.call("get_workitem_brief", { work_item_id: "2" }), { code: "MCP_SESSION_REQUIRED" });
  assert.equal(fixture.calls.length, 1);
});

test("bridge passes final invocation checks to the host and releases leases on rejection", async () => {
  let current = true, dispatched = false;
  const fixture = hostFixture({ async callTool(_server, _name, _args, options) {
    current = false;
    options.assertCurrent();
    dispatched = true;
  } });
  const client = await createMcpReadClient({ sessionId: "s", assertInvocationCurrent() { if (!current) throw new Error("invocation retired"); } }, fixture);
  await assert.rejects(client.call("get_workitem_brief", { work_item_id: "1" }), /invocation retired/);
  assert.equal(dispatched, false);
  assert.equal(fixture.leases(), 0);
});

test("public host schema validation rejects invalid calls without applying defaults", async () => {
  const { validateJsonSchemaValue } = await import("openclaw/plugin-sdk/json-schema-runtime");
  const args = { work_item_id: "1" };
  const schema = { type: "object", properties: { work_item_id: { type: "string" }, limit: { type: "integer", default: 50 } }, required: ["work_item_id"], additionalProperties: false };
  const fixture = hostFixture({ peekCatalog: () => ({ tools: [{ serverName: "lark-project", toolName: "get_workitem_brief", inputSchema: schema }], servers: {} }) });
  const host = { ...await fixture.loadHost(), validateJsonSchemaValue };
  const client = await createMcpReadClient({ sessionId: "s" }, { loadHost: async () => host });
  await client.call("get_workitem_brief", args);
  assert.deepEqual(args, { work_item_id: "1" });
  await assert.rejects(client.call("get_workitem_brief", { work_item_id: 1 }), { code: "INVALID_MCP_ARGUMENTS" });
  await assert.rejects(client.call("get_workitem_brief", { ...args, unknown: true }), { code: "INVALID_MCP_ARGUMENTS" });
  schema.required.push("limit");
  await assert.rejects(client.call("get_workitem_brief", args), { code: "INVALID_MCP_ARGUMENTS" });
  assert.equal(fixture.calls.length, 1);
});

test("business errors preserve the server message, code and trace ID", () => {
  const payload = { content: [{ type: "text", text: "log_id: fixture-trace" }, { type: "text", text: '{"code":403,"msg":"no project permission: project_key=s"}' }] };
  assert.throws(() => unwrapMcpResult(payload), { code: "MCP_READ_FAILED", message: "no project permission: project_key=s [server_code=403, log_id=fixture-trace]", server_code: 403, log_id: "fixture-trace" });
  let metadata;
  assert.deepEqual(unwrapMcpResult({ ...payload, structuredContent: { code: 0, data: { id: "1" } } }, (meta) => { metadata = meta; }), { id: "1" });
  assert.deepEqual(metadata, { log_id: "fixture-trace" });
});

test("diagnostics redact credentials and signed URLs while keeping useful error context", () => {
  const payload = { isError: true, content: [{ type: "text", text: 'missing field priority; access_token=fixture-secret; api_key=fixture-api-key; Authorization: Bearer fixture-bearer; https://files.example/signed?sign=fixture-sign' }] };
  assert.throws(() => unwrapMcpResult(payload), (error) => {
    assert.match(error.message, /missing field priority/);
    assert.doesNotMatch(error.message, /fixture-secret|fixture-api-key|fixture-bearer|fixture-sign/);
    return true;
  });
});

test("multi-text MCP errors preserve every diagnostic and the last Go-compatible trace entry", () => {
  const payload = { isError: true, content: [
    { type: "text", text: "logid: old-trace" }, { type: "text", text: "missing field priority" },
    { type: "image", data: "ignored" }, { type: "text", text: "" },
    { type: "text", text: "query field metadata before retry; access_token=fixture-private" },
    { type: "text", text: "log_id: latest-trace" },
  ] };
  assert.throws(() => unwrapMcpResult(payload), (error) => {
    assert.equal(error.code, "MCP_READ_FAILED");
    assert.equal(error.log_id, "latest-trace");
    assert.match(error.message, /missing field priority.*query field metadata before retry/);
    assert.doesNotMatch(error.message, /fixture-private|old-trace/);
    return true;
  });
});

test("authentication codes in later JSON error blocks or structured content remain terminal", () => {
  for (const structured of [false, true]) {
    const payload = { isError: true, content: [{ type: "text", text: "请重新连接飞书项目" }] };
    const auth = { code: "AUTH_EXPIRED", message: "会话已失效" };
    if (structured) payload.structuredContent = auth;
    else payload.content.push({ type: "text", text: JSON.stringify(auth) });
    assert.throws(() => unwrapMcpResult(payload), { code: "AUTH_REQUIRED", authentication: true, server_code: "AUTH_EXPIRED" });
  }
  // Classification must inspect the whole response, not only the diagnostic
  // prefix retained for display.
  assert.throws(() => unwrapMcpResult({ isError: true, content: [
    { type: "text", text: "context ".repeat(200) }, { type: "text", text: "OAuth token expired" },
  ] }), { authentication: true });
});

test("empty or trace-only MCP errors are server failures rather than invalid JSON", () => {
  for (const content of [[], [{ type: "text", text: "log_id: trace-only" }]]) {
    assert.throws(() => unwrapMcpResult({ isError: true, content }), { code: "MCP_READ_FAILED" });
  }
});

test("mixed structured and text errors preserve auth classification, code and redacted diagnostics", () => {
  for (const serialized of [false, true]) {
    const structured = { code: 3001, message: "OAuth token expired; access_token=fixture-secret" };
    const payload = { isError: true, structuredContent: serialized ? JSON.stringify(structured) : structured, content: [
      { type: "text", text: "Request failed" }, { type: "text", text: "log_id: mixed-auth" },
    ] };
    assert.throws(() => unwrapMcpResult(payload), (error) => {
      assert.equal(error.code, "AUTH_REQUIRED");
      assert.equal(error.authentication, true);
      assert.equal(error.server_code, 3001);
      assert.equal(error.log_id, "mixed-auth");
      assert.match(error.message, /OAuth token expired.*Request failed/);
      assert.doesNotMatch(error.message, /fixture-secret/);
      return true;
    });
  }
  assert.throws(() => unwrapMcpResult({ isError: true,
    structuredContent: { code: 3001, message: "Project permission denied" },
    content: [{ type: "text", text: "Request failed" }],
  }), { code: "MCP_READ_FAILED", authentication: false, server_code: 3001 });
});

test("successful multi-text responses use the first business JSON as the official Go client does", () => {
  assert.deepEqual(unwrapMcpResult({ content: [
    { type: "text", text: "logid: fixture" }, { type: "text", text: '{"id":900719925474099312345}' },
    { type: "text", text: "additional explanatory text" }, { type: "text", text: '{"id":"other"}' },
  ] }), { id: "900719925474099312345" });
  assert.throws(() => unwrapMcpResult({ content: [
    { type: "text", text: "not a structured read result" }, { type: "text", text: '{"id":"1"}' },
  ] }), { code: "INVALID_MCP_RESULT" });
});

test("nested server diagnostics stay actionable and authentication errors stay terminal", () => {
  assert.throws(() => unwrapMcpResult(result({ inner_err: { message: "missing field priority" } })), { message: "missing field priority" });
  assert.throws(() => unwrapMcpResult(result({ code: "AUTH_REQUIRED", msg: "请重新连接" })), { code: "AUTH_REQUIRED", authentication: true, server_code: "AUTH_REQUIRED" });
});

test("outer and nested authentication codes survive every supported error envelope", () => {
  for (const value of [
    { code: 401, error: "会话已失效，请重新连接" },
    { code: 401, error: { code: 500, message: "会话已失效" } },
    { code: 500, message: "请求失败", error: { code: 401, message: "会话已失效" } },
    { code: 0, inner_err: { statusCode: 401, message: "会话已失效" } },
  ]) for (const wrapper of [
    { structuredContent: value }, result(value),
    { isError: true, structuredContent: value },
    { isError: true, content: [{ type: "text", text: JSON.stringify(value) }] },
  ]) {
    wrapper.content ??= [];
    wrapper.content.push({ type: "text", text: "log_id: envelope-trace" });
    assert.throws(() => unwrapMcpResult(wrapper), (error) => {
      assert.equal(error.authentication, true);
      assert.equal(error.code, "AUTH_REQUIRED");
      assert.equal(error.server_code, 401);
      assert.equal(error.log_id, "envelope-trace");
      assert.match(error.message, /会话已失效/);
      return true;
    });
  }
  assert.throws(() => unwrapMcpResult(result({ error: "AUTH_EXPIRED", message: "会话已失效" })), { authentication: true, server_code: "AUTH_EXPIRED" });
});

test("nested permission errors retain diagnostics without being treated as expired authentication", () => {
  const value = { code: 403, message: "项目不可访问", error: { message: "缺少权限; access_token=fixture-private" } };
  assert.throws(() => unwrapMcpResult(result(value)), (error) => {
    assert.equal(error.authentication, false);
    assert.equal(error.server_code, 403);
    assert.match(error.message, /项目不可访问.*缺少权限/);
    assert.doesNotMatch(error.message, /fixture-private/);
    return true;
  });
});

test("the real client forwards successful trace metadata without changing business data", async () => {
  const fixture = hostFixture({ callTool: async () => ({ content: [{ type: "text", text: "logid: fixture-123" }, ...result({ id: "1" }).content] }) });
  const client = await createMcpReadClient({ sessionId: "s" }, fixture);
  let metadata;
  assert.deepEqual(await client.call("get_workitem_brief", { work_item_id: "1" }, undefined, (meta) => { metadata = meta; }), { id: "1" });
  assert.deepEqual(metadata, { log_id: "fixture-123" });
});

test("cancellation releases the waiter but keeps the lease until the host request settles", async () => {
  let finish;
  const fixture = hostFixture({ callTool: () => new Promise((resolve) => { finish = () => resolve(result({ id: "1" })); }) });
  const client = await createMcpReadClient({ sessionId: "s" }, fixture);
  const controller = new AbortController();
  const pending = client.call("get_workitem_brief", { work_item_id: "1" }, controller.signal);
  await delay(0);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(fixture.leases(), 1);
  finish(); await delay(0);
  assert.equal(fixture.leases(), 0);
});

const hasHost = await import("openclaw/plugin-sdk/security-runtime").then(() => true, () => false);
test("installed OpenClaw runtime entry is compatible without creating a session", { skip: !hasHost && "OpenClaw host SDK is not installed" }, async () => {
  const host = await loadHostMcpModule();
  assert.equal(typeof host.peekSessionMcpRuntime, "function");
  await assert.rejects(createMcpReadClient({ sessionId: "lark-project-unit-test-absent" }), { code: "MCP_SESSION_REQUIRED" });
});
