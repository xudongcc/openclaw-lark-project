import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { batchGetWorkitems, queryAll } from "../src/read-tools.js";
import { McpReadError, unwrapMcpResult } from "../src/mcp-read-client.js";

const fake = (call, properties = {}) => ({ call, schema: () => ({ properties }), concurrency: 3 });
const args = (extra = {}) => ({ arguments: { project_key: "space", mql: "SELECT `work_item_id`, `name` FROM `space`.`story`" }, ...extra });
const records = (count, start = 1) => Array.from({ length: count }, (_, i) => ({ work_item_id: String(start + i) }));
const firstMql = (count = 120) => ({ session_id: "session-1", list: [{ count, group_infos: [{ group_id: "1" }] }], data: records(Math.min(count, 50)) });

test("batch deduplicates IDs without losing precision, bounds parallelism, and preserves input order", async () => {
  let active = 0, peak = 0;
  const seen = [];
  const client = fake(async (name, input) => {
    assert.equal(name, "get_workitem_brief");
    seen.push(input); peak = Math.max(peak, ++active);
    await delay(input.work_item_id === "1" ? 15 : 1); active--;
    return { id: input.work_item_id };
  });
  const result = await batchGetWorkitems({ project_key: "space", work_item_ids: ["001", "900719925474099312345", "2", "3", "1"], fields: ["name"] }, {}, { client });
  assert.equal(peak, 3);
  assert.deepEqual(result.results.map((row) => row.work_item_id), ["1", "900719925474099312345", "2", "3"]);
  assert.deepEqual(result.summary, { requested: 5, total: 4, succeeded: 4, failed: 0, complete: true });
  assert.ok(seen.every((input) => input.project_key === "space" && input.fields[0] === "name"));
});

test("batch honors the host's sequential setting and preserves per-item failures", async () => {
  let active = 0;
  const client = fake(async (_name, input) => {
    assert.equal(active++, 0); await delay(1); active--;
    if (input.work_item_id === "2") throw new McpReadError("NOT_FOUND", "工作项不存在。");
    return { next_page_token: "fields-next" };
  });
  client.concurrency = 1;
  const result = await batchGetWorkitems({ project_key: "space", work_item_ids: ["1", "2", "3"], fields: ["_all"] }, {}, { client });
  assert.equal(result.results[0].data.next_page_token, "fields-next");
  assert.deepEqual(result.errors, [{ work_item_id: "2", code: "NOT_FOUND", message: "工作项不存在。" }]);
  assert.equal(result.summary.complete, false);
});

test("batch stops scheduling after authentication failure", async () => {
  let calls = 0;
  const client = fake(async () => { calls++; throw new McpReadError("AUTH_REQUIRED", "重新连接。", true); });
  client.concurrency = 1;
  await assert.rejects(batchGetWorkitems({ project_key: "space", work_item_ids: ["1", "2", "3"] }, {}, { client }), { code: "AUTH_REQUIRED" });
  assert.equal(calls, 1);
});

test("batch cancellation never creates unfilled success slots", async () => {
  const controller = new AbortController();
  const client = fake(async () => { controller.abort(); return { ignored: true }; });
  await assert.rejects(batchGetWorkitems({ project_key: "space", work_item_ids: ["1", "2"] }, {}, { client, signal: controller.signal }), { name: "AbortError" });
});

test("batch validates the entire input before opening the host connection", async () => {
  const openClient = () => assert.fail("invalid input must not open a client");
  for (const ids of [[], [1], ["0"], ["-1"], ["12.3"], ["bad"], Array.from({ length: 201 }, () => "1")]) {
    await assert.rejects(batchGetWorkitems({ project_key: "space", work_item_ids: ids }, {}, { openClient }));
  }
});

test("MQL all-pages uses session/group pagination without resending MQL or losing null-metadata pages", async () => {
  const calls = [];
  const client = fake(async (name, input) => {
    assert.equal(name, "search_by_mql"); calls.push(input);
    return calls.length === 1 ? firstMql() : { list: null, session_id: null, data: records(calls.length === 3 ? 20 : 50, (calls.length - 1) * 50 + 1) };
  });
  const result = await queryAll(args(), {}, { client });
  assert.equal(result.summary.complete, true);
  assert.equal(result.summary.expected_total, 120);
  assert.equal(result.pages.length, 3);
  assert.deepEqual(calls[1], { project_key: "space", session_id: "session-1", group_pagination_list: [{ group_id: "1", page_num: 2 }] });
  assert.equal(calls[2].group_pagination_list[0].page_num, 3);
  assert.equal(result.pages[1].data.list, null);
  assert.equal(result.pages[0].data.list[0].count, 120);
});

test("MQL groups use independent counts and page counters", async () => {
  const calls = [];
  const client = fake(async (_name, input) => {
    calls.push(input);
    return calls.length === 1 ? { session_id: "s", list: [
      { count: 60, group_infos: [{ group_id: "A" }] }, { count: 110, group_infos: [{ group_id: "B" }] },
    ], data: [...records(50), ...records(50, 1001)] } : { data: input.group_pagination_list[0].group_id === "A" ? records(10, 51) : records(calls.length === 4 ? 10 : 50, calls.length === 4 ? 1101 : 1051) };
  });
  const result = await queryAll(args(), {}, { client });
  assert.equal(result.summary.expected_total, 170);
  assert.deepEqual(calls.slice(1).map((input) => input.group_pagination_list[0]), [{ group_id: "A", page_num: 2 }, { group_id: "B", page_num: 2 }, { group_id: "B", page_num: 3 }]);
  assert.equal(result.summary.complete, true);
});

test("MQL zero results and a single page need no session ID", async () => {
  for (const count of [0, 50]) {
    let calls = 0;
    const result = await queryAll(args(), {}, { client: fake(async () => { calls++; return { list: [{ count }], data: records(count) }; }) });
    assert.equal(result.summary.complete, true);
    assert.equal(calls, 1);
  }
});

test("MQL missing sessions or ambiguous group counts stay explicitly incomplete", async () => {
  for (const [data, reason] of [
    [{ list: [{ count: 51 }] }, "missing_mql_session_id"],
    [{ session_id: "s", list: [{ count: 101, group_infos: [{ group_id: "A" }, { group_id: "B" }] }] }, "unsupported_mql_group_metadata"],
    [{ data: [] }, "unsupported_mql_group_metadata"],
  ]) {
    const result = await queryAll(args(), {}, { client: fake(async () => data) });
    assert.equal(result.summary.complete, false);
    assert.equal(result.summary.stopped_reason, reason);
    assert.equal(result.pages.length, 1);
  }
});

test("page cap returns the exact next MQL request", async () => {
  const result = await queryAll(args({ max_pages: 1 }), {}, { client: fake(async () => firstMql()) });
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.stopped_reason, "max_pages");
  assert.deepEqual(result.continuation.arguments, { project_key: "space", session_id: "session-1", group_pagination_list: [{ group_id: "1", page_num: 2 }] });
  assert.equal(result.continuation.merge_mode, "append");
  assert.equal(result.continuation.page_index, result.pages.length);
});

for (const tokenName of ["page_token", "next_page_token"]) test(`cursor pagination uses the live schema's ${tokenName}`, async () => {
  const calls = [];
  const client = fake(async (_name, input) => {
    calls.push(input);
    return calls.length === 1 ? { items: [1], next_page_token: "two" } : { items: [2], next_page_token: "" };
  }, { [tokenName]: { type: "string" } });
  const result = await queryAll({ tool_name: "get_workitem_op_record", arguments: { project_key: "space", work_item_id: "1" } }, {}, { client });
  assert.equal(calls[1][tokenName], "two");
  assert.equal(result.summary.complete, true);
  assert.deepEqual(result.pages.flatMap((page) => page.data.items), [1, 2]);
});

test("page-number pagination advances through the final has_more=false page", async () => {
  const calls = [];
  const result = await queryAll({ tool_name: "list_workitem_field_config", arguments: { project_key: "space", page_num: 1 } }, {}, {
    client: fake(async (_name, input) => { calls.push(input); return { items: [calls.length], pagination: { has_more: calls.length < 3, total: 3 } }; }, { page_num: { type: "integer" } }),
  });
  assert.deepEqual(calls.map((input) => input.page_num), [1, 2, 3]);
  assert.equal(result.summary.complete, true);
});

test("unknown pagination, repeated cursors and repeated pages are not reported as complete", async () => {
  const unknown = await queryAll({ tool_name: "list_todo", arguments: {} }, {}, { client: fake(async () => ({ items: [1], has_more: true })) });
  assert.equal(unknown.summary.stopped_reason, "unsupported_pagination");
  let calls = 0;
  const repeated = await queryAll({ tool_name: "get_workitem_brief", arguments: { work_item_id: "1" } }, {}, { client: fake(async () => ({ items: [++calls], next_page_token: "same" }), { page_token: {} }) });
  assert.equal(repeated.summary.stopped_reason, "repeated_cursor");
  assert.equal(repeated.continuation.merge_mode, "replace");
  assert.equal(repeated.continuation.page_index, 1);
  assert.deepEqual(repeated.continuation.arguments, repeated.pages[1].arguments);
  const repeatedPage = await queryAll(args(), {}, { client: fake(async () => firstMql(60)) });
  assert.equal(repeatedPage.summary.stopped_reason, "repeated_items");
  assert.equal(repeatedPage.continuation.merge_mode, "replace");
  assert.equal(repeatedPage.continuation.page_index, 1);
});

test("three consecutive empty pages stop when the cursor keeps advancing", async () => {
  let calls = 0;
  const result = await queryAll({ tool_name: "get_workitem_brief", arguments: { work_item_id: "1" } }, {}, { client: fake(async () => ({ items: [], next_page_token: String(++calls) }), { page_token: {} }) });
  assert.equal(result.summary.stopped_reason, "consecutive_empty_pages");
  assert.equal(calls, 4);
});

test("page errors preserve earlier results; auth errors and cancellation are terminal", async () => {
  for (const auth of [false, true]) {
    let calls = 0;
    const client = fake(async () => { if (++calls > 1) throw new McpReadError("FAIL", "查询失败。", auth); return firstMql(); });
    if (auth) await assert.rejects(queryAll(args(), {}, { client }), { authentication: true });
    else {
      const result = await queryAll(args(), {}, { client });
      assert.equal(result.summary.stopped_reason, "page_failed");
      assert.equal(result.pages.length, 1);
      assert.equal(result.continuation.arguments.group_pagination_list[0].page_num, 2);
      assert.equal(result.continuation.merge_mode, "append");
      assert.equal(result.continuation.page_index, 1);
    }
  }
  const controller = new AbortController();
  await assert.rejects(queryAll(args(), {}, { client: fake(async () => { controller.abort(); return firstMql(); }), signal: controller.signal }), { name: "AbortError" });
});

test("query rejects writes and noninitial pagination before opening the client", async () => {
  const openClient = () => assert.fail("no client should open");
  for (const input of [args({ tool_name: "update_field" }), args({ max_pages: 201 }), args({ arguments: { project_key: "s", mql: "x", session_id: "bad" } }), { tool_name: "list_todo", arguments: { page_num: 2 } }]) {
    await assert.rejects(queryAll(input, {}, { openClient }));
  }
});

test("result-size limit preserves data and does not issue another request", async () => {
  let calls = 0;
  const result = await queryAll({ tool_name: "list_todo", arguments: {} }, {}, { client: fake(async () => { calls++; return { data: ["x".repeat(8 * 1024 * 1024)], next_page_token: "more" }; }, { page_token: {} }) });
  assert.equal(calls, 1);
  assert.equal(result.summary.stopped_reason, "result_size_limit");
  assert.equal(result.continuation.arguments.page_token, "more");
});

test("todo without has_more continues until an empty page, including a short nonempty page", async () => {
  const calls = [];
  const result = await queryAll({ tool_name: "list_todo", arguments: { action: "todo", page_num: 1 } }, {}, { client: fake(async (_name, input) => {
    calls.push(input.page_num);
    return { list: input.page_num === 1 ? records(50) : input.page_num === 2 ? records(3, 51) : [] };
  }, { page_num: { type: "integer" } }) });
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(result.summary.complete, true);
  assert.equal(result.summary.received_items, 53);
});

test("paged tools with missing pagination metadata are never marked complete", async () => {
  for (const key of ["page_num", "page_no", "page_token"]) {
    const result = await queryAll({ tool_name: "list_workitem_field_config", arguments: {} }, {}, { client: fake(async () => ({ items: records(50) }), { [key]: {} }) });
    assert.equal(result.summary.complete, false);
    assert.equal(result.summary.stopped_reason, "missing_pagination_metadata");
  }
});

test("MQL short or empty final pages cannot satisfy the declared total", async () => {
  for (const count of [0, 5]) {
    let calls = 0;
    const result = await queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? firstMql(60) : { list: null, session_id: null, data: records(count, 51) }) });
    assert.equal(result.summary.complete, false);
    assert.equal(result.summary.stopped_reason, "row_count_mismatch");
    assert.equal(result.summary.expected_total, 60);
    assert.equal(result.summary.received_items, 50 + count);
    assert.equal(result.continuation.arguments.group_pagination_list[0].page_num, 2);
    assert.equal(result.continuation.merge_mode, "replace");
    assert.equal(result.continuation.page_index, 1);
  }
});

test("MQL cannot certify an unrecognized row structure", async () => {
  const first = firstMql(20); delete first.data; first.unknown_rows = records(20);
  const result = await queryAll(args(), {}, { client: fake(async () => first) });
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.stopped_reason, "unverified_row_count");
});

test("MQL preserves identical projected values across every legitimate page", async () => {
  let calls = 0;
  const values = Array.from({ length: 50 }, () => ({ name: "同名需求" }));
  const result = await queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? { session_id: "s", list: [{ count: 150 }], data: values } : { session_id: null, list: null, data: values }) });
  assert.equal(result.summary.complete, true);
  assert.equal(result.pages.flatMap((page) => page.data.data).length, 150);
  assert.equal(result.summary.received_items, 150);
});

for (const name of ["list_wbs_draft_rows", "list_wbs_instance_rows"]) test(`${name} advances page_no and resumes at the correct page`, async () => {
  const calls = [];
  const client = fake(async (_name, input) => {
    calls.push(input);
    return { items: [{ uuid: `row-${input.page_no}` }], has_more: input.page_no < 2 };
  }, { page_no: { type: "integer" } });
  const result = await queryAll({ tool_name: name, arguments: { work_item_id: "1", page_no: 1 } }, {}, { client });
  assert.equal(result.summary.complete, true);
  assert.deepEqual(calls.map((input) => input.page_no), [1, 2]);
  assert.ok(calls.every((input) => !Object.hasOwn(input, "page_num")));
  const truncated = await queryAll({ tool_name: name, arguments: { work_item_id: "1", page_no: 1 }, max_pages: 1 }, {}, { client });
  assert.equal(truncated.summary.complete, false);
  assert.equal(truncated.continuation.arguments.page_no, 2);
  await assert.rejects(queryAll({ tool_name: name, arguments: { page_no: 2 } }, {}, { openClient: () => assert.fail("no connection") }));
});

test("a final has_more=false does not override a contradictory declared total", async () => {
  const result = await queryAll({ tool_name: "list_workitem_field_config", arguments: { page_num: 1 } }, {}, {
    client: fake(async () => ({ items: records(2), pagination: { total: 5, has_more: false } }), { page_num: {} }),
  });
  assert.equal(result.summary.complete, false);
  assert.equal(result.summary.stopped_reason, "row_count_mismatch");
  assert.equal(result.continuation, undefined);
});

test("replaying an incomplete MQL page replaces it without deduplicating legitimate equal values", async () => {
  let calls = 0;
  const projected = (count) => Array.from({ length: count }, () => ({ name: "同名需求" }));
  const result = await queryAll(args(), {}, { client: fake(async () => ++calls === 1
    ? { session_id: "s", list: [{ count: 60 }], data: projected(50) }
    : { data: projected(5) }) });
  assert.equal(result.summary.received_items, 55);
  const { continuation, pages } = result;
  assert.equal(continuation.merge_mode, "replace");
  assert.deepEqual(pages[continuation.page_index].arguments, continuation.arguments);
  // A consumer follows the advertised merge contract, then recounts all pages.
  pages.splice(continuation.page_index, 1, { arguments: continuation.arguments, data: { data: projected(10) } });
  assert.equal(pages.flatMap((page) => page.data.data).length, 60);
  assert.equal(pages.length, 2);
});

test("MQL stops at a short intermediate page and retries that page, not the final one", async () => {
  const calls = [];
  const result = await queryAll(args(), {}, { client: fake(async (_name, input) => {
    calls.push(input);
    return calls.length === 1 ? firstMql(120) : { data: records(40, 51) };
  }) });
  assert.equal(calls.length, 2);
  assert.equal(result.summary.stopped_reason, "row_count_mismatch");
  assert.equal(result.continuation.merge_mode, "replace");
  assert.equal(result.continuation.page_index, 1);
  assert.equal(result.continuation.arguments.group_pagination_list[0].page_num, 2);
});

test("MQL replacement indexes are output array indexes, not per-group page numbers", async () => {
  let calls = 0;
  const result = await queryAll(args(), {}, { client: fake(async () => {
    if (++calls === 1) return { session_id: "s", list: [
      { count: 60, group_infos: [{ group_id: "A" }] }, { count: 60, group_infos: [{ group_id: "B" }] },
    ], data: [...records(50), ...records(50, 1001)] };
    return { data: calls === 2 ? records(10, 51) : records(5, 1051) };
  }) });
  assert.equal(result.continuation.page_index, 2);
  assert.equal(result.continuation.merge_mode, "replace");
  assert.deepEqual(result.continuation.arguments.group_pagination_list, [{ group_id: "B", page_num: 2 }]);
});

test("MQL validates the first-page count before fetching any follow-up pages", async () => {
  let calls = 0;
  const result = await queryAll(args(), {}, { client: fake(async () => { calls++; return { ...firstMql(120), data: records(40) }; }) });
  assert.equal(calls, 1);
  assert.equal(result.summary.stopped_reason, "row_count_mismatch");
  assert.equal(result.continuation, undefined);
});

test("unrecognized MQL follow-up rows carry an explicit replacement continuation", async () => {
  let calls = 0;
  const result = await queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? firstMql(60) : { unknown_rows: records(10, 51) }) });
  assert.equal(result.summary.stopped_reason, "unverified_row_count");
  assert.equal(result.continuation.merge_mode, "replace");
  assert.equal(result.continuation.page_index, 1);
});

test("multi-text MCP authentication errors stop batch scheduling and all-page reads", async () => {
  const expired = { isError: true, content: [
    { type: "text", text: "OAuth token expired" }, { type: "text", text: "Reconnect before retry" }, { type: "text", text: "log_id: auth-trace" },
  ] };
  let calls = 0;
  const client = fake(async () => { calls++; return unwrapMcpResult(expired); });
  client.concurrency = 1;
  await assert.rejects(batchGetWorkitems({ project_key: "s", work_item_ids: ["1", "2", "3"] }, {}, { client }), { code: "AUTH_REQUIRED", authentication: true, log_id: "auth-trace" });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? firstMql(120) : unwrapMcpResult(expired)) }), { code: "AUTH_REQUIRED", authentication: true });
  assert.equal(calls, 2);
});

test("structured authentication with a generic text error stops batch and pagination", async () => {
  const expired = { isError: true, structuredContent: { code: 3001, message: "OAuth token expired" },
    content: [{ type: "text", text: "Request failed" }] };
  let calls = 0;
  const client = fake(async () => { calls++; return unwrapMcpResult(expired); });
  client.concurrency = 1;
  await assert.rejects(batchGetWorkitems({ project_key: "s", work_item_ids: ["1", "2", "3"] }, {}, { client }), { authentication: true, server_code: 3001 });
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? firstMql(120) : unwrapMcpResult(expired)) }), { authentication: true, server_code: 3001 });
  assert.equal(calls, 2);
});

test("lost host invocation, session or tool authority stops batch and pagination", async () => {
  for (const code of ["MCP_INVOCATION_EXPIRED", "MCP_SESSION_REQUIRED", "MCP_CATALOG_REQUIRED", "MCP_TOOL_UNAVAILABLE"]) {
    let calls = 0;
    const fail = () => { throw new McpReadError(code, "host authority ended"); };
    const client = fake(async () => { calls++; return fail(); });
    client.concurrency = 1;
    await assert.rejects(batchGetWorkitems({ project_key: "s", work_item_ids: ["1", "2", "3"] }, {}, { client }), { code });
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? firstMql(120) : fail()) }), { code });
    assert.equal(calls, 2);
  }
});

test("batch and query pages retain metadata and structured error diagnostics", async () => {
  const client = fake(async (_name, input, _signal, onMetadata) => {
    onMetadata?.({ log_id: "fixture-log" });
    if (input.work_item_id === "2") throw new McpReadError("MCP_READ_FAILED", "字段缺失", false, { server_code: 403, log_id: "error-log" });
    return { items: [1] };
  });
  const batch = await batchGetWorkitems({ project_key: "s", work_item_ids: ["1", "2"] }, {}, { client });
  assert.equal(batch.results[0].log_id, "fixture-log");
  assert.deepEqual(batch.errors[0], { work_item_id: "2", code: "MCP_READ_FAILED", message: "字段缺失 [server_code=403, log_id=error-log]", server_code: 403, log_id: "error-log" });
  const query = await queryAll({ tool_name: "list_project_team", arguments: {} }, {}, { client });
  assert.equal(query.pages[0].log_id, "fixture-log");
});

test("wrapped authentication failures terminate batch and pagination, but permission failures do not", async () => {
  for (const payload of [
    { code: 401, error: "会话已失效，请重新连接" },
    { code: 500, message: "请求失败", inner_err: { code: "AUTH_EXPIRED", message: "请重新连接" } },
  ]) {
    let calls = 0;
    const expired = () => unwrapMcpResult({ structuredContent: payload });
    const client = fake(async () => { calls++; return expired(); });
    client.concurrency = 1;
    await assert.rejects(batchGetWorkitems({ project_key: "s", work_item_ids: ["1", "2", "3"] }, {}, { client }), { code: "AUTH_REQUIRED", authentication: true });
    assert.equal(calls, 1);
    calls = 0;
    await assert.rejects(queryAll(args(), {}, { client: fake(async () => ++calls === 1 ? firstMql(120) : expired()) }), { code: "AUTH_REQUIRED", authentication: true });
    assert.equal(calls, 2);
  }
  let calls = 0;
  const client = fake(async () => ++calls === 1 ? unwrapMcpResult({ structuredContent: { code: 403, error: "无项目权限" } }) : { name: "readable" });
  client.concurrency = 1;
  const result = await batchGetWorkitems({ project_key: "s", work_item_ids: ["1", "2"] }, {}, { client });
  assert.equal(calls, 2);
  assert.equal(result.errors[0].server_code, 403);
  assert.equal(result.results[0].work_item_id, "2");
});
