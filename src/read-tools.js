// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT
// Adapted from meegle-cli 51b6c92fe7bab9f830db9f4bbf2739927c434815:
// internal/products/meegle/{batch,mcp_runtime}.go. MQL pagination follows the
// same revision's skills/meegle/SKILL.md session/group protocol.
import { createHash } from "node:crypto";
import { createMcpReadClient, READ_TOOLS, McpReadError } from "./mcp-read-client.js";

function string(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string`);
  return value;
}

function signalFor(signal) {
  const timeout = AbortSignal.timeout(10 * 60 * 1000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function errorInfo(error) {
  return { code: error instanceof McpReadError ? error.code : "MCP_READ_FAILED", message: error instanceof McpReadError ? error.message : "查询失败，请单独核对该目标。", ...(error.log_id ? { log_id: error.log_id } : {}), ...(error.server_code !== undefined ? { server_code: error.server_code } : {}) };
}

function terminalError(error) {
  return error.authentication || ["MCP_INVOCATION_EXPIRED", "MCP_SESSION_REQUIRED", "MCP_CATALOG_REQUIRED", "MCP_TOOL_UNAVAILABLE"].includes(error.code);
}

export async function batchGetWorkitems(args, ctx = {}, { signal, client, openClient = createMcpReadClient } = {}) {
  signal = signalFor(signal);
  signal.throwIfAborted();
  const projectKey = string(args.project_key, "project_key");
  if (!Array.isArray(args.work_item_ids) || !args.work_item_ids.length || args.work_item_ids.length > 200) throw new Error("work_item_ids must contain 1..200 string IDs");
  const ids = [...new Set(args.work_item_ids.map((id) => {
    if (typeof id !== "string" || !/^\d+$/u.test(id.trim()) || BigInt(id.trim()) <= 0n) throw new Error("work_item_ids must be positive decimal strings");
    return BigInt(id.trim()).toString();
  }))];
  const shared = { project_key: projectKey };
  for (const key of ["fields", "page_size", "page_token"]) if (args[key] !== undefined) shared[key] = args[key];
  client ??= await openClient(ctx);
  const controller = new AbortController();
  const workSignal = AbortSignal.any([signal, controller.signal]);
  const slots = new Array(ids.length);
  let next = 0, terminal;
  const worker = async () => {
    while (!workSignal.aborted && next < ids.length) {
      const index = next++;
      try {
        let metadata;
        const data = await client.call("get_workitem_brief", { ...shared, work_item_id: ids[index] }, workSignal, (meta) => { metadata = meta; });
        workSignal.throwIfAborted();
        slots[index] = { work_item_id: ids[index], data, ...metadata };
      } catch (error) {
        if (workSignal.aborted) return;
        if (terminalError(error)) { terminal = error; controller.abort(error); return; }
        slots[index] = { work_item_id: ids[index], ...errorInfo(error), failed: true };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, client.concurrency ?? 3, ids.length) }, worker));
  signal.throwIfAborted();
  if (terminal) throw terminal;
  const results = slots.filter((row) => !row.failed);
  const errors = slots.filter((row) => row.failed).map(({ failed, ...row }) => row);
  return { results, errors, summary: { requested: args.work_item_ids.length, total: ids.length, succeeded: results.length, failed: errors.length, complete: errors.length === 0 } };
}

const integer = (n) => Number.isSafeInteger(n) && n >= 0;
const hash = (data) => createHash("sha256").update(JSON.stringify(data)).digest("hex");
const ROW_KEYS = ["items", "data", "workitem_fields", "work_items", "workitem_list", "rows", "list"];

function rowsOf(data, mql = false) {
  if (Array.isArray(data)) return data;
  for (const key of ROW_KEYS) if ((!mql || key !== "list") && Array.isArray(data[key])) return data[key];
}

function mqlGroups(data) {
  if (!Array.isArray(data.list) || !data.list.length) return;
  const groups = new Map();
  for (const entry of data.list) {
    if (!Array.isArray(entry.group_infos) || !entry.group_infos.length) {
      if (data.list.length !== 1 || !integer(entry.count)) return;
      groups.set("1", entry.count);
      continue;
    }
    for (const info of entry.group_infos) {
      const count = info.count ?? (entry.group_infos.length === 1 ? entry.count : undefined);
      if (typeof info.group_id !== "string" || !info.group_id || !integer(count)) return;
      if (groups.has(info.group_id) && groups.get(info.group_id) !== count) return;
      groups.set(info.group_id, count);
    }
  }
  return [...groups].map(([group_id, count]) => ({ group_id, count, next_page_num: 2 }));
}

export async function queryAll(args, ctx = {}, { signal, client, openClient = createMcpReadClient } = {}) {
  signal = signalFor(signal);
  signal.throwIfAborted();
  const name = args.tool_name ?? "search_by_mql";
  if (!READ_TOOLS.includes(name)) throw new Error("query_all only accepts the documented read-only MCP tools");
  if (!args.arguments || typeof args.arguments !== "object" || Array.isArray(args.arguments)) throw new Error("arguments must be an object");
  const maxPages = args.max_pages ?? 200;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 200) throw new Error("max_pages must be within 1..200");
  const base = structuredClone(args.arguments);
  const mql = name === "search_by_mql";
  if (mql) {
    string(base.project_key, "arguments.project_key"); string(base.mql, "arguments.mql");
    if (base.session_id !== undefined || base.group_pagination_list !== undefined) throw new Error("query_all MQL must start with project_key + mql, without session pagination arguments");
  } else if (["page_num", "page_no"].some((key) => base[key] !== undefined && base[key] !== 1) || base.page_token || base.next_page_token) {
    throw new Error("query_all must start at the first page without a cursor; resume continuation with the original MCP tool");
  }
  client ??= await openClient(ctx);
  const schema = client.schema(name);
  const properties = schema?.properties ?? {};
  let firstMetadata;
  const first = await client.call(name, base, signal, (metadata) => { firstMetadata = metadata; });
  signal.throwIfAborted();
  const pages = [{ arguments: base, data: first, ...firstMetadata }];
  let bytes = Buffer.byteLength(JSON.stringify(first)), emptyStreak = 0;
  let stoppedReason, continuation, failure;
  let nextArgs;
  let groups, sessionId;
  let tokenKey;
  const pageKey = ["page_num", "page_no"].find((key) => Object.hasOwn(base, key) && Object.hasOwn(properties, key)) ?? ["page_num", "page_no"].find((key) => Object.hasOwn(properties, key));
  if (mql) {
    groups = mqlGroups(first);
    sessionId = first.session_id;
    if (!groups) stoppedReason = "unsupported_mql_group_metadata";
    else if (groups.some((group) => group.count > 50) && (typeof sessionId !== "string" || !sessionId)) stoppedReason = "missing_mql_session_id";
  }
  const expectedTotal = mql ? groups?.reduce((total, group) => total + group.count, 0) : first.pagination?.total ?? first.total;
  const totalKnown = integer(expectedTotal);
  const firstRows = rowsOf(first, mql);
  let rowsKnown = firstRows !== undefined || expectedTotal === 0;
  let received = firstRows?.length ?? 0;
  const identities = new Map();
  // Only use object identity where its meaning is defined. Equal selected
  // values (e.g. SELECT name) are legitimate across different pages.
  const identityKey = mql ? "work_item_id" : name.startsWith("list_wbs_") ? "uuid" : undefined;
  const rememberIdentities = (rows, group = "") => {
    if (!identityKey || !rows?.length || !rows.every((row) => row && ["string", "number"].includes(typeof row[identityKey]))) return false;
    const seen = identities.get(group) ?? new Set();
    let repeated = false;
    for (const row of rows) {
      const id = String(row[identityKey]);
      if (seen.has(id)) repeated = true;
      seen.add(id);
    }
    identities.set(group, seen);
    return repeated;
  };
  if (!mql || groups?.length === 1) if (rememberIdentities(firstRows, groups?.[0]?.group_id)) stoppedReason ??= "repeated_items";
  if (mql && groups && !rowsKnown) stoppedReason ??= "unverified_row_count";
  if (mql && groups && rowsKnown && received !== groups.reduce((total, group) => total + Math.min(50, group.count), 0)) stoppedReason ??= "row_count_mismatch";
  const nextRequest = (last) => {
    if (mql) {
      const group = groups.find((item) => item.next_page_num <= Math.ceil(item.count / 50));
      if (!group) return;
      return { project_key: base.project_key, session_id: sessionId, group_pagination_list: [{ group_id: group.group_id, page_num: group.next_page_num }] };
    }
    const token = last.next_page_token;
    const hasMore = last.pagination?.has_more ?? last.has_more;
    if (hasMore !== undefined && typeof hasMore !== "boolean") { stoppedReason = "invalid_pagination"; return; }
    if (token !== undefined && token !== null && typeof token !== "string") { stoppedReason = "invalid_cursor"; return; }
    if (typeof token === "string" && token) {
      tokenKey ??= ["next_page_token", "page_token"].find((key) => Object.hasOwn(properties, key));
      if (!tokenKey) { stoppedReason = "unsupported_cursor_parameter"; return; }
      return { ...base, [tokenKey]: token };
    }
    if (hasMore === false) return;
    const emptyTerminated = name === "list_todo" && pageKey;
    if (hasMore === true || (emptyTerminated && rowsOf(last)?.length > 0)) {
      if (!pageKey) { stoppedReason = "unsupported_pagination"; return; }
      const pageNumber = pages.at(-1).arguments[pageKey] ?? 1;
      if (!Number.isSafeInteger(pageNumber) || pageNumber < 1 || pageNumber >= Number.MAX_SAFE_INTEGER) { stoppedReason = "invalid_page_number"; return; }
      return { ...base, [pageKey]: pageNumber + 1 };
    }
    if (emptyTerminated && rowsOf(last)?.length === 0) return;
    if (token !== undefined) return;
    if (pageKey || ["next_page_token", "page_token"].some((key) => Object.hasOwn(properties, key))) stoppedReason = "missing_pagination_metadata";
  };
  const visitedRequests = new Map([[hash(base), 0]]);
  // page_index always refers to this response's pages array, not a server page
  // number (MQL has independent page counters per group).
  const resumeAt = (arguments_, pageIndex = pages.length) => ({
    tool_name: name, arguments: arguments_,
    merge_mode: pageIndex < pages.length ? "replace" : "append", page_index: pageIndex,
  });
  while (!stoppedReason && (nextArgs = nextRequest(pages.at(-1).data))) {
    signal.throwIfAborted();
    const requestHash = hash(nextArgs);
    continuation = resumeAt(nextArgs, visitedRequests.get(requestHash));
    if (visitedRequests.has(requestHash)) { stoppedReason = "repeated_cursor"; break; }
    if (pages.length >= maxPages) { stoppedReason = "max_pages"; break; }
    if (bytes >= 8 * 1024 * 1024) { stoppedReason = "result_size_limit"; break; }
    visitedRequests.set(requestHash, pages.length);
    let data, metadata;
    try { data = await client.call(name, nextArgs, signal, (meta) => { metadata = meta; }); }
    catch (error) {
      signal.throwIfAborted();
      if (terminalError(error)) throw error;
      failure = errorInfo(error); stoppedReason = "page_failed"; break;
    }
    signal.throwIfAborted();
    pages.push({ arguments: nextArgs, data, ...metadata });
    continuation = resumeAt(nextArgs, pages.length - 1);
    const rows = rowsOf(data, mql);
    rowsKnown &&= rows !== undefined;
    received += rows?.length ?? 0;
    const groupId = nextArgs.group_pagination_list?.[0]?.group_id;
    if (rememberIdentities(rows, groupId)) { stoppedReason = "repeated_items"; break; }
    if (mql) {
      const group = groups.find((group) => group.group_id === groupId);
      const expected = Math.min(50, group.count - (group.next_page_num - 1) * 50);
      if (!rows || rows.length !== expected) { stoppedReason = rows ? "row_count_mismatch" : "unverified_row_count"; break; }
      group.next_page_num++;
    }
    const count = rows?.length;
    emptyStreak = count === 0 ? emptyStreak + 1 : 0;
    bytes += Buffer.byteLength(JSON.stringify(data));
    continuation = undefined;
    if (emptyStreak >= 3) { const pending = nextRequest(data); if (pending) { continuation = resumeAt(pending, visitedRequests.get(hash(pending))); stoppedReason = "consecutive_empty_pages"; } break; }
  }
  if (!stoppedReason && totalKnown && (!rowsKnown || received !== expectedTotal)) {
    stoppedReason = rowsKnown ? "row_count_mismatch" : "unverified_row_count";
    // A generic total mismatch cannot identify which page was incomplete.
    // Retrying an arbitrary last page would give callers a false recovery plan.
    continuation = undefined;
  }
  // Do not flatten arbitrary business arrays: MQL follow-up list/session fields
  // can be null, and groups/fields may have different schemas. Keep every page.
  return {
    tool_name: name, pages,
    summary: { complete: !stoppedReason, pages_fetched: pages.length, ...(totalKnown ? { expected_total: expectedTotal } : {}), ...(rowsKnown ? { received_items: received } : {}), ...(stoppedReason ? { stopped_reason: stoppedReason } : {}) },
    ...(continuation?.arguments ? { continuation } : {}), ...(failure ? { error: failure } : {}),
  };
}
