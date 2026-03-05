import { LarkProject } from "./sdk";

type PluginConfig = {
  pluginId: string;
  pluginSecret: string;
  userKey: string;
};

function wrapResult(result: any) {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function wrapError(tool: string, err: any) {
  return {
    content: [
      { type: "text", text: `${tool} 失败: ${err?.message || String(err)}` },
    ],
    isError: true,
  };
}

export default function register(api: any) {
  const cfg = (api?.config || {}) as PluginConfig;

  const client = new LarkProject({
    pluginId: cfg.pluginId,
    pluginSecret: cfg.pluginSecret,
    userKey: cfg.userKey,
  });

  api?.logger?.info?.("[lark-project] plugin loaded", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserKey: Boolean(cfg.userKey),
  });

  api.registerTool(
    {
      name: "update_workitem_description",
      description:
        "更新工作项描述字段（用于补充 MCP update_field 在描述字段上的限制）。支持通过 url 自动解析 project_key/work_item_type/work_item_id。",
      parameters: {
        type: "object",
        required: ["description"],
        properties: {
          url: {
            type: "string",
            description:
              "工作项详情页 URL，例如 https://project.feishu.cn/<project_key>/<work_item_type>/detail/<work_item_id>",
          },
          project_key: { type: "string" },
          work_item_type: {
            type: "string",
            description: "如 story / issue / bug",
          },
          work_item_type_key: {
            type: "string",
            description: "work_item_type 的别名",
          },
          work_item_id: { type: "string" },
          description: {
            type: "string",
            description: "要写入的描述内容（支持 markdown 文本）",
          },
          field_key: {
            type: "string",
            description:
              "默认 description。仅在你的空间使用自定义描述字段 key 时传入。",
          },
        },
      },
      async execute(_id: string, params: any) {
        try {
          const result = await client.updateWorkitemDescription(params);
          return wrapResult(result);
        } catch (err: any) {
          return wrapError("update_workitem_description", err);
        }
      },
    },
    { optional: true },
  );
}
