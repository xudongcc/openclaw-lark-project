import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { access } from "node:fs/promises";

export const READ_TOOLS = [
  "get_workitem_brief", "search_by_mql", "get_workitem_op_record",
  "list_workitem_types", "get_workitem_field_meta", "list_workitem_field_config", "list_workitem_role_config",
  "get_node_detail", "get_transitable_states", "get_transition_required", "list_node_field_config",
  "list_workitem_comments", "list_workitem_relations", "list_related_workitem", "get_workitem_man_hour_records",
  "list_schedule", "list_todo", "get_view_detail", "search_view_by_title", "list_multi_project_view_workitems",
  "get_chart_detail", "list_charts", "list_project_team", "list_team_members", "search_project_info", "search_user_info",
  "list_deliverables", "get_resource_work_item_type_conf", "list_wbs_draft_rows", "list_wbs_instance_rows", "list_element_template",
];

export class McpReadError extends Error {
  constructor(code, message, authentication = false, details = {}) {
    const diagnostic = [details.server_code !== undefined ? `server_code=${details.server_code}` : "", details.log_id ? `log_id=${details.log_id}` : ""].filter(Boolean).join(", ");
    // Hosts may serialize thrown tool errors using only Error.message.
    super(diagnostic ? `${message} [${diagnostic}]` : message);
    this.code = code;
    this.authentication = authentication;
    if (details.log_id) this.log_id = details.log_id;
    if (details.server_code !== undefined) this.server_code = details.server_code;
  }
}

function diagnosticText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/https?:\/\/[^\s"'<>]+/giu, "[URL]")
    .replace(/\bBearer\s+[^\s,;"']+/giu, "Bearer [REDACTED]")
    .replace(/(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|token|api[_-]?key|authorization|cookie|client[_-]?secret|password|sign)\b["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, "$1[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 1000).trim();
}

function responseError(value, metadata = {}, textBlocks = []) {
  const codes = [], messages = [];
  const collect = (entry, depth = 0) => {
    if (typeof entry === "string") { if (entry.trim()) messages.push(entry); return; }
    if (!entry || typeof entry !== "object" || depth >= 4) return;
    for (const key of ["code", "error_code", "status", "statusCode"]) {
      const code = entry[key];
      if (["number", "string"].includes(typeof code) && code !== 0 && code !== "0" && code !== "") codes.push(code);
    }
    // Retain outer codes and inspect nested diagnostics even when an outer
    // message is present. Authentication failures must stop every caller.
    for (const key of ["message", "msg", "err_msg", "inner_err", "error"]) collect(entry[key], depth + 1);
  };
  for (const entry of Array.isArray(value) ? value : [value]) collect(entry);
  messages.push(...textBlocks);
  const isAuthCode = (code) => code === 401 || code === "401" || ["AUTH_EXPIRED", "AUTH_REQUIRED", "UNAUTHORIZED"].includes(code);
  const authCode = codes.find(isAuthCode) ?? messages.find(isAuthCode);
  const code = authCode ?? codes[0];
  const rawMessage = [...new Set(messages)].join("\n");
  const message = diagnosticText(rawMessage);
  const auth = authCode !== undefined || /\b401\b|\bunauthorized\b|authentication.{0,20}(?:required|expired|failed)|oauth.{0,20}(?:required|expired)|token.{0,20}(?:expired|invalid)/iu.test(rawMessage);
  const serverCode = typeof code === "number" ? code : typeof code === "string" ? diagnosticText(code).slice(0, 100) : undefined;
  return new McpReadError(auth ? "AUTH_REQUIRED" : "MCP_READ_FAILED", auth ? `飞书项目认证失效，请在 OpenClaw 重新连接后重试。${message ? ` ${message}` : ""}` : message || `飞书项目查询失败${serverCode !== undefined ? `（code=${serverCode}）` : ""}。`, auth, { ...metadata, server_code: serverCode });
}

function parseBusinessJSON(text) {
  return JSON.parse(text, (_key, value, context) => {
    if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) {
      if (!context?.source) throw new Error("Cannot preserve large integer precision");
      return context.source;
    }
    return value;
  });
}

export function unwrapMcpResult(result, onMetadata) {
  if (!result || typeof result !== "object") throw new McpReadError("INVALID_MCP_RESULT", "MCP 返回了无效结果。");
  const blocks = [];
  let logId;
  for (const item of Array.isArray(result.content) ? result.content : []) {
    if (item?.type !== "text" || typeof item.text !== "string" || !item.text.trim()) continue;
    if (/^log_?id:/iu.test(item.text.trim())) logId = item.text.trim().replace(/^log_?id:\s*/iu, "");
    else blocks.push(item.text);
  }
  const metadata = logId && /^[\w.:-]{1,256}$/u.test(logId) ? { log_id: logId } : {};
  onMetadata?.(metadata);
  const invalid = (message) => new McpReadError("INVALID_MCP_RESULT", message, false, metadata);
  let value = result.structuredContent;
  if (result.isError) {
    // meegle-cli/mcpclient/response.go joins every non-trace text on errors.
    // Inspect each JSON block too, so a later auth code still stops a batch.
    const values = blocks.map((text) => { try { return parseBusinessJSON(text); } catch { return text; } });
    if (value !== undefined) {
      try { values.unshift(typeof value === "string" ? parseBusinessJSON(value) : value); }
      catch { values.unshift(value); }
    }
    // Classify once from all original diagnostics, before display redaction or
    // truncation. Generic text must not erase structured authentication errors.
    throw responseError(values, metadata, blocks);
  }
  if (value === undefined) {
    // Success uses the first business text, as in the Go client; later notes
    // are not additional result pages. Read orchestration still requires JSON.
    if (!blocks.length) throw invalid("MCP 未返回 JSON 业务结果。");
    try { value = parseBusinessJSON(blocks[0]); } catch { throw invalid("MCP 返回内容不是可无损解析的 JSON。"); }
  }
  // Some servers serialize the business envelope inside structuredContent.
  if (typeof value === "string") { try { value = parseBusinessJSON(value); } catch { throw invalid("MCP 业务结果不是可无损解析的 JSON。"); } }
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "number" && Number.isInteger(item) && !Number.isSafeInteger(item)) throw invalid("MCP structuredContent 包含已丢失精度的大整数，请使用原始查询结果核对 ID。");
    if (item && typeof item === "object") for (const value of Object.values(item)) pending.push(value);
  }
  for (let depth = 0; depth < 4; depth++) {
    if (!value || typeof value !== "object" || Array.isArray(value)) break;
    if (value.error || value.inner_err || value.err_msg) throw responseError(value, metadata);
    const code = value.code ?? value.error_code;
    if (code !== undefined && code !== 0 && code !== "0") throw responseError(value, metadata);
    if (code !== undefined && Object.hasOwn(value, "data")) value = value.data;
    else break;
  }
  if (value === null || typeof value !== "object") throw invalid("MCP 业务结果为空或格式不支持。");
  return value;
}

export function abortable(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

// The session manager is shipped by OpenClaw 2026.10.8 but is not a public
// plugin SDK. Keep this single compatibility boundary; never create sessions,
// read OAuth stores, or fall back to another user's connection.
export async function loadHostMcpModule() {
  let directory, validateJsonSchemaValue;
  try {
    directory = path.dirname(fileURLToPath(import.meta.resolve("openclaw/plugin-sdk/security-runtime")));
    ({ validateJsonSchemaValue } = await import("openclaw/plugin-sdk/json-schema-runtime"));
  } catch { throw new McpReadError("HOST_MCP_UNAVAILABLE", "宿主未提供兼容的 OpenClaw MCP runtime 与公开 schema 校验接口。"); }
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(directory, "agents", "agent-bundle-mcp-manager-api.js");
    try { await access(candidate); } catch { directory = path.dirname(directory); continue; }
    const host = await import(pathToFileURL(candidate).href);
    if (typeof host.peekSessionMcpRuntime === "function" && typeof validateJsonSchemaValue === "function") {
      return { peekSessionMcpRuntime: host.peekSessionMcpRuntime, validateJsonSchemaValue };
    }
    break;
  }
  throw new McpReadError("HOST_MCP_UNAVAILABLE", "当前 OpenClaw 版本的会话 MCP runtime 不兼容；请直接使用官方 MCP 查询工具。");
}

export async function createMcpReadClient(ctx, { loadHost = loadHostMcpModule } = {}) {
  if (!ctx.sessionId && !ctx.sessionKey) throw new McpReadError("MCP_SESSION_REQUIRED", "查询编排需要当前 OpenClaw 会话。");
  ctx.assertInvocationCurrent?.();
  const host = await loadHost();
  const identity = { sessionId: ctx.sessionId, sessionKey: ctx.sessionKey };
  const runtime = host.peekSessionMcpRuntime(identity);
  if (!runtime || (ctx.sessionId && runtime.sessionId !== ctx.sessionId) ||
      (ctx.sessionKey && runtime.sessionKey && runtime.sessionKey !== ctx.sessionKey)) {
    throw new McpReadError("MCP_SESSION_REQUIRED", "当前会话尚无 MCP 连接；请先连接飞书项目并完成会话工具发现。");
  }
  const assertCurrent = () => {
    try {
      ctx.assertInvocationCurrent?.();
      runtime.assertOwnerCurrent?.();
    } catch (error) {
      throw new McpReadError("MCP_INVOCATION_EXPIRED", `当前调用已失效，请重新发起查询。${diagnosticText(error?.message)}`);
    }
    if (host.peekSessionMcpRuntime(identity) !== runtime) throw new McpReadError("MCP_SESSION_REQUIRED", "当前 MCP 会话已更换，请重新发起查询。");
    const scope = runtime.requesterScope;
    if ((runtime.isRequesterScopedServer?.("lark-project") && !scope) ||
        (scope && ["requesterSenderId", "agentAccountId", "messageChannel"].some((key) => scope[key] !== ctx[key]))) {
      throw new McpReadError("MCP_SESSION_REQUIRED", "当前 MCP 连接不属于本次请求者，请使用当前会话提供的官方 MCP 工具。");
    }
  };
  const catalogNow = () => {
    assertCurrent();
    const catalog = runtime.peekCatalog?.();
    if (!catalog) throw new McpReadError("MCP_CATALOG_REQUIRED", "当前会话尚未发现 MCP 工具；请先完成飞书项目工具发现。");
    return catalog;
  };
  const descriptor = (name) => {
    const catalog = catalogNow();
    const entry = READ_TOOLS.includes(name) && catalog.tools.find((tool) => tool.serverName === "lark-project" && tool.toolName === name);
    if (!entry || entry.excludedFromOpenClawCatalog || entry.deniedBySession || entry.oauthConnectBootstrap ||
        (entry.uiVisibility && !entry.uiVisibility.includes("model")) || catalog.servers["lark-project"]?.deniedToolNames?.includes(name)) {
      throw new McpReadError("MCP_TOOL_UNAVAILABLE", "当前飞书项目连接未暴露所需的只读工具，请检查连接和工具筛选。");
    }
    return entry;
  };
  catalogNow();
  return {
    get concurrency() { return catalogNow().servers["lark-project"]?.supportsParallelToolCalls === true ? 3 : 1; },
    schema(name) { return descriptor(name).inputSchema; },
    async call(name, args, signal, onMetadata) {
      const assertCallCurrent = () => {
        signal?.throwIfAborted();
        const schema = descriptor(name).inputSchema;
        const checked = host.validateJsonSchemaValue({ schema, value: args, applyDefaults: false });
        if (!checked.ok) throw new McpReadError("INVALID_MCP_ARGUMENTS", `参数不符合当前 MCP 工具 schema。${diagnosticText(JSON.stringify(checked.errors))}`);
      };
      assertCallCurrent();
      const release = runtime.acquireLease?.();
      const pending = Promise.resolve().then(() => {
        assertCallCurrent();
        runtime.markUsed();
        return runtime.callTool("lark-project", name, args, { assertCurrent: assertCallCurrent });
      }).then((result) => {
        assertCurrent();
        return unwrapMcpResult(result, onMetadata);
      }).catch((error) => {
        if (signal?.aborted) throw signal.reason;
        if (error instanceof McpReadError) throw error;
        throw responseError(error);
      }).finally(() => release?.());
      // Cancellation stops scheduling/waiting, without disposing a shared host
      // connection. The lease remains until an in-flight host request settles.
      return await abortable(pending, signal);
    },
  };
}
