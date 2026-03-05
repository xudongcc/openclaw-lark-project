import { FeishuProjectMcpClient, type SearchByMqlParams } from "./mcp-client";
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
  const mcpBaseUrl = "https://project.feishu.cn/mcp_server/v1";

  const tokenManager = new TokenManager({
    baseUrl,
    pluginId: cfg.pluginId,
    pluginSecret: cfg.pluginSecret,
    userId: cfg.userId,
  });

  const mcpClient = new FeishuProjectMcpClient(mcpBaseUrl, () => tokenManager.getPluginAccessToken());

  api?.logger?.info?.("[lark-project-workitem] plugin loaded", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserId: Boolean(cfg.userId),
    baseUrl,
    mcpBaseUrl,
  });

  api.registerTool(
    {
      name: "search_by_mql",
      description: "使用 MOQL 进行 Meego/飞书项目数据查询。",
      parameters: {
        type: "object",
        title: "search_by_mql",
        required: ["project_key"],
        properties: {
          project_key: {
            type: "string",
            description: "要查询的工作项类型所属的空间 projectKey/simpleName/空间名",
          },
          moql: {
            type: "string",
            description: "要执行的 MOQL 语句。",
          },
          session_id: {
            type: "string",
            description: "会话 ID，用于分页查询。",
          },
          group_pagination_list: {
            type: "array",
            description: "分页信息，目前只支持一组分页数据。",
            items: {
              type: "object",
              properties: {
                group_id: {
                  type: "string",
                  description: "分组 ID（来自返回体 list.group_infos.group_id）",
                },
                page_num: {
                  type: "number",
                  description: "页码，从 1 开始，每页 50 条",
                },
              },
            },
          },
        },
      },
      async execute(_id: string, params: SearchByMqlParams) {
        try {
          const result = await mcpClient.searchByMql(params);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err: any) {
          return {
            content: [
              {
                type: "text",
                text: `search_by_mql 执行失败: ${err?.message || String(err)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
    { optional: true },
  );
}
