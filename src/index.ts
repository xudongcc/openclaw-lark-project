import { FeishuProjectOpenApiClient, type ToolName } from "./openapi-client";
import { TokenManager } from "./token";

type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userId: string;
  baseUrl?: string;
};

function wrapResult(result: any) {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function wrapError(tool: string, err: any) {
  return {
    content: [{ type: "text", text: `${tool} 失败: ${err?.message || String(err)}` }],
    isError: true,
  };
}

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

  const registerTool = (
    name: ToolName,
    description: string,
    parameters: Record<string, any>,
  ) => {
    api.registerTool(
      {
        name,
        description,
        parameters,
        async execute(_id: string, params: any) {
          try {
            const result = await openapi.callTool(name, params);
            return wrapResult(result);
          } catch (err: any) {
            return wrapError(name, err);
          }
        },
      },
      { optional: true },
    );
  };

  registerTool("get_workitem_info", "获取工作项类型可用字段与角色信息。", {
    type: "object",
    required: ["work_item_type"],
    properties: {
      work_item_type: { type: "string" },
      project_key: { type: "string" },
      url: { type: "string" },
    },
  });

  registerTool("search_by_mql", "使用 MOQL 查询飞书项目数据。", {
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
  });

  registerTool("update_field", "更新工作项字段值（支持一次多个字段）。", {
    type: "object",
    required: ["work_item_id"],
    properties: {
      work_item_id: { type: "string" },
      work_item_type: { type: "string", description: "建议传，便于定位 OpenAPI 路径" },
      project_key: { type: "string" },
      url: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_key: { type: "string" },
            field_value: { type: "string" },
          },
        },
      },
    },
  });

  registerTool("create_workitem", "创建工作项实例。", {
    type: "object",
    required: ["work_item_type"],
    properties: {
      work_item_type: { type: "string" },
      project_key: { type: "string" },
      url: { type: "string" },
      fields: {
        type: "array",
        items: {
          type: "object",
          properties: {
            field_key: { type: "string" },
            field_value: { type: "string" },
          },
        },
      },
    },
  });

  registerTool("finish_node", "完成节点流转。", {
    type: "object",
    required: ["work_item_id", "node_id"],
    properties: {
      work_item_id: { type: "string" },
      work_item_type: { type: "string", description: "建议传，便于定位 OpenAPI 路径" },
      node_id: { type: "string" },
      project_key: { type: "string" },
      url: { type: "string" },
    },
  });

  registerTool("get_node_detail", "获取节点详情。", {
    type: "object",
    required: ["work_item_id", "node_id"],
    properties: {
      work_item_id: { type: "string" },
      work_item_type: { type: "string", description: "建议传，便于定位 OpenAPI 路径" },
      node_id: { type: "string" },
      project_key: { type: "string" },
      url: { type: "string" },
    },
  });

  registerTool("get_view_detail", "获取视图详情。", {
    type: "object",
    required: ["view_id"],
    properties: {
      view_id: { type: "string" },
      project_key: { type: "string" },
      url: { type: "string" },
      page_num: { type: "number" },
      fields: { type: "array", items: { type: "string" } },
    },
  });

  registerTool("get_workitem_brief", "获取工作项概况。", {
    type: "object",
    required: ["work_item_id"],
    properties: {
      work_item_id: { type: "string" },
      work_item_type: { type: "string", description: "建议传，便于定位 OpenAPI 路径" },
      project_key: { type: "string" },
      url: { type: "string" },
      fields: { type: "array", items: { type: "string" } },
    },
  });

  registerTool("list_schedule", "查询指定用户时间段排期与工作量。", {
    type: "object",
    required: ["project_key", "user_keys", "start_time", "end_time"],
    properties: {
      project_key: { type: "string" },
      user_keys: { type: "array", items: { type: "string" } },
      start_time: { type: "string" },
      end_time: { type: "string" },
      work_item_type_keys: { type: "array", items: { type: "string" } },
    },
  });

  registerTool("list_todo", "查询当前用户待办/已办（分页）。", {
    type: "object",
    required: ["action", "page_num"],
    properties: {
      action: { type: "string", enum: ["todo", "done", "overdue", "this_week"] },
      page_num: { type: "number" },
      asset_key: { type: "string" },
    },
  });
}
