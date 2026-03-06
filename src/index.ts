import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { z } from "zod/v4";
import { LarkProject } from "./sdk";

/**
 * 工作项定位参数，所有 action 共用。
 * 支持通过 `url` 自动解析或显式传入 `project_key` / `work_item_type` / `work_item_id`。
 */
const WorkItemLocator = {
  url: z
    .string()
    .describe(
      "工作项详情页 URL，例如 https://project.feishu.cn/<project_key>/<type>/detail/<id>",
    )
    .optional(),
  project_key: z.string().optional(),
  work_item_type: z.string().describe("如 story / issue / bug").optional(),
  work_item_type_key: z.string().describe("work_item_type 的别名").optional(),
  work_item_id: z.string().optional(),
};

/**
 * `lark_project` 工具的统一参数 Schema。
 *
 * @remarks
 * 使用 `z.discriminatedUnion("action", ...)` 按 action 字段分发，
 * 通过 `z.toJSONSchema()` 转换后传给 `api.registerTool`。
 */
const LarkProjectToolSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_work_item_description"),
    ...WorkItemLocator,
    description: z.string().describe("要写入的描述内容（支持 markdown）"),
    field_key: z.string().describe("描述字段 key，默认 description").optional(),
  }),
  z.object({
    action: z.literal("create_work_item_comment"),
    ...WorkItemLocator,
    content: z.string().describe("评论内容（纯文本）"),
  }),
  z.object({
    action: z.literal("list_work_item_comments"),
    ...WorkItemLocator,
  }),
  z.object({
    action: z.literal("delete_work_item_comment"),
    ...WorkItemLocator,
    comment_id: z.string().describe("要删除的评论 ID"),
  }),
  z.object({
    action: z.literal("update_work_item_role_owners"),
    ...WorkItemLocator,
    role_owners: z
      .array(
        z.object({
          role: z.string().describe("角色 ID，如 rd、PM、QA"),
          owners: z.array(z.string()).describe("user_key 列表"),
        }),
      )
      .describe("角色人员列表（覆盖更新，需传入全部角色）"),
  }),
]);

/** 插件配置 Zod Schema。 */
const LarkProjectConfigSchema = z.object({
  pluginId: z.string().default(""),
  pluginSecret: z.string().default(""),
  userKey: z.string().default(""),
});

/**
 * 插件配置 Schema，符合 {@link OpenClawPluginConfigSchema} 接口。
 *
 * @remarks
 * - `parse` 使用 `LarkProjectConfigSchema` 验证并规范化配置
 * - `uiHints` 提供 UI 渲染提示（标签、占位符、敏感标记）
 */
const configSchema = {
  parse(value: unknown): z.infer<typeof LarkProjectConfigSchema> {
    return LarkProjectConfigSchema.parse(value ?? {});
  },
  uiHints: {
    pluginId: { label: "Plugin ID", placeholder: "例如: MII_*" },
    pluginSecret: {
      label: "Plugin Secret",
      placeholder: "输入插件密钥",
      sensitive: true,
    },
    userKey: {
      label: "User Key",
      placeholder: "例如: ou_xxx 或 user_xxx",
    },
  },
};

/**
 * OpenClaw 插件定义（对象式导出）。
 *
 * @remarks
 * 参照 openclaw 官方插件模式：
 * - 通过 `api.pluginConfig` 读取插件专属配置
 * - `configSchema.parse()` 进行配置验证与默认值填充
 * - 注册单一 `lark_project` 工具，通过 `action` 字段分发四种操作
 */
const larkProjectPlugin = {
  id: "openclaw-lark-project",
  name: "Lark Project",
  description:
    "飞书项目工作项描述更新与评论管理，补充 MCP update_field 在描述字段上的限制。",
  configSchema,

  /**
   * 插件注册入口，由 openclaw 运行时调用。
   *
   * @param api - openclaw 插件 API
   */
  register(api: OpenClawPluginApi) {
    const config = configSchema.parse(api.pluginConfig);

    const client = new LarkProject({
      pluginId: config.pluginId,
      pluginSecret: config.pluginSecret,
      userKey: config.userKey,
    });

    /** 将任意 payload 包装为工具返回的文本内容格式。 */
    const json = (payload: unknown) => ({
      content: [
        { type: "text" as const, text: JSON.stringify(payload, null, 2) },
      ],
      details: payload,
    });

    api.registerTool(
      {
        name: "lark_project",
        label: "Lark Project",
        description:
          "管理飞书项目工作项：更新描述、修改角色人员、添加/查询/删除评论。通过 action 字段选择操作。",
        parameters: z.toJSONSchema(LarkProjectToolSchema),

        async execute(
          _toolCallId: string,
          params: z.infer<typeof LarkProjectToolSchema>,
        ) {
          try {
            switch (params.action) {
              case "update_work_item_description":
                return json(await client.updateWorkItemDescription(params));

              case "create_work_item_comment":
                return json(await client.createWorkItemComment(params));

              case "list_work_item_comments":
                return json(await client.listWorkItemComments(params));

              case "delete_work_item_comment":
                return json(await client.deleteWorkItemComment(params));

              case "update_work_item_role_owners":
                return json(await client.updateWorkItemRoleOwners(params));

              default:
                return json({
                  error: `未知的工具调用`,
                });
            }
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );
  },
};

export default larkProjectPlugin;
