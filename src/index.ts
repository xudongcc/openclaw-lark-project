import { FeishuProjectOpenApiClient } from "./openapi-client";
import { TokenManager } from "./token";

type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userId: string;
  baseUrl?: string;
};

export default function register(api: any) {
  const cfg = (api?.config || {}) as PluginConfig;
  const baseUrl = cfg.baseUrl || "https://project.feishu.cn";

  const tokenManager = new TokenManager({
    baseUrl,
    pluginId: cfg.pluginId,
    pluginSecret: cfg.pluginSecret,
    userId: cfg.userId,
  });

  const openapi = new FeishuProjectOpenApiClient({
    baseUrl,
    userKey: cfg.userId,
    getPluginToken: () => tokenManager.getPluginAccessToken(),
    getUserToken: () => tokenManager.getUserAccessToken(),
  });

  api?.logger?.info?.("[lark-project-workitem] plugin loaded (OpenAPI mode)", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserId: Boolean(cfg.userId),
    baseUrl,
  });

  api.registerTool(
    {
      name: "search_by_mql",
      description: "使用 MOQL 查询飞书项目数据（OpenAPI 实现，参数设计借鉴 MCP）。",
      parameters: {
        type: "object",
        required: ["project_key"],
        properties: {
          project_key: { type: "string" },
          moql: { type: "string" },
          session_id: { type: "string" },
          group_pagination_list: {
            type: "array",
            items: {
              type: "object",
              properties: {
                group_id: { type: "string" },
                page_num: { type: "number" },
              },
            },
          },
        },
      },
      async execute(_id: string, params: any) {
        try {
          const result = await openapi.searchByMoql(params);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `search_by_mql 失败: ${err?.message || String(err)}` }], isError: true };
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "get_workitem_info",
      description: "获取空间/工作项类型信息，用于辅助生成可读 MOQL 字段名。",
      parameters: {
        type: "object",
        required: ["project_key"],
        properties: {
          project_key: { type: "string" },
          work_item_type_key: { type: "string" },
        },
      },
      async execute(_id: string, params: any) {
        try {
          const result = await openapi.getWorkitemInfo(params);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `get_workitem_info 失败: ${err?.message || String(err)}` }], isError: true };
        }
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "update_workitem_status",
      description: "更新工作项状态（OpenAPI 实现）。",
      parameters: {
        type: "object",
        required: ["project_key", "work_item_type_key", "work_item_id", "status"],
        properties: {
          project_key: { type: "string" },
          work_item_type_key: { type: "string" },
          work_item_id: { type: "string" },
          status: { type: "string" },
        },
      },
      async execute(_id: string, params: any) {
        try {
          const result = await openapi.updateWorkitemStatus(params);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `update_workitem_status 失败: ${err?.message || String(err)}` }], isError: true };
        }
      },
    },
    { optional: true },
  );
}
