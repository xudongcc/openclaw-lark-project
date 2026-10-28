import { decodeURL } from "./url-decode.js";
import { uploadAttachment, downloadAttachment } from "./attachments.js";
import { batchGetWorkitems, queryAll } from "./read-tools.js";
import { READ_TOOLS } from "./mcp-read-client.js";

const text = (description) => ({ type: "string", minLength: 1, description });
const object = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const multipart = object({
  part_count: { type: "integer", minimum: 1, maximum: 100000 },
  part_size: { type: "integer", minimum: 1 },
  need: { type: "array", items: object({ part_index: { type: "integer", minimum: 0 }, start_byte: { type: "integer", minimum: 0 }, end_byte: { type: "integer", minimum: 0 } }, ["part_index", "start_byte", "end_byte"]) },
}, ["part_count"]);

function plan(kind) {
  return {
    ...object({
      [`${kind}_url`]: text("MCP 返回的原始对象存储 URL，保留 :part_number 占位符。"),
      sign: text("MCP 返回的文件签名；不是 OAuth token。"),
      is_multipart: { type: "boolean" }, multipart,
      target_unit_code: { type: "string", description: "MCP 返回时原样传入，用于每个分片的 x-target-unit 路由。" },
    }, [`${kind}_url`, "sign", "is_multipart"]),
    additionalProperties: true,
    description: `从 ${kind === "upload" ? "upload_file" : "get_download_url"} 的真实返回中提取业务对象，不能编造签名或 URL。`,
  };
}

function tool(name, description, parameters, execute) {
  return {
    name, label: name, description, parameters,
    async execute(_callId, args, signal) {
      const result = await execute(args, signal);
      return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
    },
  };
}

export default {
  id: "lark-project",
  name: "飞书项目",
  register(api) {
    api.registerTool(tool("lark-project__url_decode", "解析飞书项目链接，返回页面类别、空间 simple_name、工作项/视图/图表 ID 等候选信息。纯本地解析，不验证账号权限；后续必须用 MCP 查询验证业务目标。", object({ url: text("飞书项目 URL、无协议域名链接或以 / 开头的绝对路径。") }, ["url"]), (args) => decodeURL(args.url)), { workspaceAccess: false });
    api.registerTool((ctx) => ctx.sandboxed ? null : tool("lark-project__attachment_upload", "检查或上传用户指定的本地文件。省略 upload_plan 时仅返回真实文件名、大小、MIME 和指纹；据此调用 MCP upload_file 后，再传回 upload_plan 与 expected_fingerprint 执行单次/分片传输。返回 file_token 后仍需绑定字段/评论并回读验收。", object({
      source_path: text("用户指定的本地文件；相对路径基于宿主会话文件根目录（默认 workspace）；上传也可读取宿主明确授权的只读目录。文件位于 OpenClaw Gateway 所在机器。"),
      file_name: text("可选的上传显示名称，必须为 basename；默认使用 source_path 的文件名。"),
      mime_type: text("可选的 MIME 类型，不带 charset 参数；默认按源文件扩展名查询 mime 包内置的类型表，忽略大小写，各平台使用相同映射。不受 file_name 覆盖影响。"),
      expected_fingerprint: text("前次检查返回的 file_fingerprint，用于防止检查后源文件发生变化。"),
      upload_plan: plan("upload"),
    }, ["source_path"]), (args, signal) => uploadAttachment(args, ctx, { signal })), { name: "lark-project__attachment_upload", workspaceAccess: "execute" });
    api.registerTool((ctx) => ctx.sandboxed ? null : tool("lark-project__attachment_download", "将 MCP get_download_url 返回的单次/分片下载计划执行到本地文件。逐片验证文件签名，成功后原子落盘，失败清理临时文件。默认拒绝覆盖；不会创建父目录。", object({
      output_path: text("用户指定的保存路径，父目录必须已存在；相对路径基于宿主会话文件根目录（默认 workspace），保存于 Gateway 所在机器；额外只读目录不允许写入。"),
      download_plan: plan("download"),
      overwrite: { type: "boolean", default: false, description: "仅用户明确同意替换目标普通文件时启用。" },
    }, ["output_path", "download_plan"]), (args, signal) => downloadAttachment(args, ctx, { signal })), { name: "lark-project__attachment_download", workspaceAccess: "execute" });
    api.registerTool((ctx) => tool("lark-project__workitem_batch_get", "批量读取同一空间的工作项，最多 200 个字符串 ID；去重后按输入顺序分别返回 results、errors、summary。复用当前会话 MCP 和 OAuth；最多 3 并发，宿主未开启并行时串行。只获取每个工作项的一页；fields=[_all] 的字段全量分页请使用 query_all。认证失效或取消时停止。", object({
      project_key: text("已查询确认的空间 key。"),
      work_item_ids: { type: "array", minItems: 1, maxItems: 200, items: { type: "string", pattern: "^[0-9]+$" }, description: "工作项 ID 字符串数组，保留大整数精度。" },
      fields: { type: "array", items: text("已确认的字段 key 或字段名。") },
      page_size: { type: "integer", minimum: 1, maximum: 200, description: "仅 fields=[_all] 的字段分页使用。" },
      page_token: text("可选的字段分页 token，通常不应向多个工作项复用同一 token。"),
    }, ["project_key", "work_item_ids"]), (args, signal) => batchGetWorkitems(args, ctx, { signal })), { name: "lark-project__workitem_batch_get", workspaceAccess: false });
    api.registerTool((ctx) => tool("lark-project__query_all", "自动分页读取白名单内的官方 MCP 查询工具。默认 search_by_mql，使用 session_id + group_pagination_list 并逐页核对行数；其他工具根据实时 schema 使用 page_token/next_page_token、page_num 或 page_no，待办无分页标记时读到空页。保留每页 arguments、data 和可用 log_id，只有 summary.complete=true 才能称为全量。最多 200 页；失败、停滞或结果过大时保留部分结果，可定位时返回 continuation，其 merge_mode=append/replace 指定追加或替换 pages 的零基 page_index。无 continuation 时不能猜测重试页。复用当前会话连接，不执行写入。", object({
      tool_name: { type: "string", enum: READ_TOOLS, default: "search_by_mql", description: "官方 MCP 短名，不带 lark-project__ 前缀。" },
      arguments: { type: "object", additionalProperties: true, description: "该只读 MCP 工具的首查参数，按当前 schema 传入。MQL 只传 project_key 和 mql。" },
      max_pages: { type: "integer", minimum: 1, maximum: 200, default: 200 },
    }, ["arguments"]), (args, signal) => queryAll(args, ctx, { signal })), { name: "lark-project__query_all", workspaceAccess: false });
  },
};
