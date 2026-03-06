import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { z } from "zod/v4";
import { LarkProject } from "./sdk/sdk";

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
  project_key: z
    .string()
    .describe("项目空间唯一标识 (例如: openclaw)")
    .optional(),
  work_item_type: z.string().describe("如 story / issue / bug").optional(),
  work_item_type_key: z.string().describe("work_item_type 的别名").optional(),
  work_item_id: z.string().describe("工作项数字 ID").optional(),
};

/**
 * `lark_project` 工具的统一参数 Schema。
 *
 * @remarks
 * 使用 `z.discriminatedUnion("action", ...)` 按 action 字段分发，
 * 通过 `z.toJSONSchema()` 转换后传给 `api.registerTool`。
 */
const LarkProjectToolSchema = z.discriminatedUnion("action", [
  // ── 评论管理 ──────────────────────────────────────────
  z.object({
    action: z
      .literal("create_work_item_comment")
      .describe(
        "在工作项下添加一条纯文本评论。返回新评论 ID（data 字段）。适用于自动化记录进展、留言通知等场景。",
      ),
    ...WorkItemLocator,
    content: z
      .string()
      .describe("评论正文（纯文本，不支持 markdown 或富文本）"),
  }),
  z.object({
    action: z
      .literal("list_work_item_comments")
      .describe(
        "获取工作项的所有评论列表。返回评论数组，每条包含 id、content、creator、created_at 等字段。可用于在删除前查找 comment_id。",
      ),
    ...WorkItemLocator,
  }),
  z.object({
    action: z
      .literal("delete_work_item_comment")
      .describe(
        "删除工作项下的指定评论。仅评论创建人有权删除。comment_id 可通过 list_work_item_comments 获取。",
      ),
    ...WorkItemLocator,
    comment_id: z
      .string()
      .describe(
        "要删除的评论 ID，通过 list_work_item_comments 返回的评论列表中获取",
      ),
  }),

  // ── 角色人员 ──────────────────────────────────────────
  z.object({
    action: z
      .literal("update_work_item_role_owners")
      .describe(
        "覆盖更新工作项的角色人员名单。⚠️ 这是覆盖更新，必须传入所有角色及其人员，未传入的角色人员会被清空。更新前应先通过 MCP get_workitem_brief 获取当前角色列表，角色 ID 可通过 MCP get_workitem_info 查询。",
      ),
    ...WorkItemLocator,
    role_owners: z
      .array(
        z.object({
          role: z
            .string()
            .describe(
              '角色 ID（如 "rd"、"pm"、"qa"），可通过 MCP get_workitem_info 获取可用角色列表',
            ),
          owners: z
            .array(z.string())
            .describe('该角色的人员 user_key 列表，如 ["ou_xxx", "ou_yyy"]'),
        }),
      )
      .describe(
        '角色人员数组（覆盖更新）。示例：[{ "role": "rd", "owners": ["ou_xxx"] }]',
      ),
  }),

  // ── 字段更新 ──────────────────────────────────────────
  z.object({
    action: z
      .literal("update_work_item_field")
      .describe(
        '更新工作项的任意字段（含描述、业务线、优先级等）。适用于 MCP update_field 不支持的字段。字段 key 和格式可通过 MCP get_workitem_info 获取。各类型 field_value 格式：单选（priority 等）→ { "label": "P0", "value": "0" }；业务线（business）→ 业务线 ID 字符串（非名称，通过 list_businesses 获取）；文本 → 字符串；数字 → 数值；人员 → user_key 字符串或数组；日期 → 毫秒时间戳；描述（description）→ markdown 字符串。',
      ),
    ...WorkItemLocator,
    update_fields: z
      .array(
        z.object({
          field_key: z
            .string()
            .describe(
              '字段 key，如 "description"、"priority"、"business"。可通过 MCP get_workitem_info 获取可用字段列表',
            ),
          field_value: z
            .any()
            .describe(
              "字段值，格式随字段类型变化。单选传 {label, value} 对象；业务线传 ID 字符串；描述传 markdown 字符串；日期传毫秒时间戳；人员传 user_key 字符串或数组",
            ),
        }),
      )
      .describe(
        '要更新的字段列表。示例：[{ "field_key": "priority", "field_value": { "label": "P0", "value": "0" } }]',
      ),
  }),

  // ── 业务线 ────────────────────────────────────────────
  z.object({
    action: z
      .literal("list_businesses")
      .describe(
        "获取指定空间下的所有业务线列表，返回每条业务线的 id 和 name。用于更新业务线字段前获取正确的业务线 ID（业务线字段的 field_value 必须传 ID 而非名称）。",
      ),
    project_key: z
      .string()
      .describe('空间唯一标识（project_key），如 "openclaw"'),
  }),

  // ── 工作流 ────────────────────────────────────────────
  z.object({
    action: z
      .literal("get_work_item_workflow")
      .describe(
        "获取工作项的工作流详情，自动区分节点流和状态流。节点流返回：workflow_nodes（节点数组，status: 1=未到达 2=已到达 3=已通过）和 connections。状态流返回：state_flow_nodes（状态节点数组，status: 2=当前状态）和 connections（含 transition_id，用于 change_state）。在执行 confirm_node / rollback_node 或 change_state 前必须先调用此接口。",
      ),
    ...WorkItemLocator,
  }),
  z.object({
    action: z
      .literal("confirm_node")
      .describe(
        "【仅节点流】完成指定节点，将其从「已到达」（status=2）推进到「已通过」。使用前需先调用 get_work_item_workflow 获取 node_id。confirm 时建议传入 node_owners。可同时更新表单字段和角色负责人。",
      ),
    ...WorkItemLocator,
    node_id: z
      .string()
      .describe(
        "目标节点 ID（即 workflow_nodes 中的 id/state_key），通过 get_work_item_workflow 获取",
      ),
    node_owners: z
      .array(z.string())
      .describe(
        '节点负责人 user_key 列表，建议传入。如 ["ou_xxx"]',
      )
      .optional(),
    node_schedule: z
      .any()
      .describe("节点排期信息（含开始/结束时间等，格式参考飞书文档）")
      .optional(),
    fields: z
      .array(
        z.object({
          field_key: z.string().describe("表单字段 key"),
          field_value: z.any().describe("字段值"),
        }),
      )
      .describe("流转时同步更新的表单字段")
      .optional(),
    role_assignee: z
      .array(
        z.object({
          role: z.string().describe("角色 ID"),
          owners: z.array(z.string()).describe("人员 user_key 列表"),
        }),
      )
      .describe("流转时同步分配的角色负责人")
      .optional(),
  }),
  z.object({
    action: z
      .literal("rollback_node")
      .describe(
        "【仅节点流】回滚指定节点，将已完成（status=3）的节点退回到「已到达」。使用前需先调用 get_work_item_workflow 获取 node_id。必须提供 rollback_reason。",
      ),
    ...WorkItemLocator,
    node_id: z
      .string()
      .describe(
        "目标节点 ID（即 workflow_nodes 中的 id/state_key），通过 get_work_item_workflow 获取",
      ),
    rollback_reason: z
      .string()
      .describe("回滚原因说明（必填）"),
  }),
  z.object({
    action: z
      .literal("change_state")
      .describe(
        "【仅状态流】执行工作项状态流转。transition_id 需先通过 get_work_item_workflow 获取：从 state_flow_nodes 找到当前状态（status=2），再从 connections 找 source_state_key 匹配的 transition_id。可同时更新表单字段和角色人员。",
      ),
    ...WorkItemLocator,
    transition_id: z
      .string()
      .describe(
        "流转 ID，从 get_work_item_workflow 返回的 connections 数组中获取（匹配 source_state_key 为当前状态的记录）",
      ),
    fields: z
      .array(
        z.object({
          field_key: z.string().describe("表单字段 key"),
          field_value: z.any().describe("字段值"),
        }),
      )
      .describe("流转时同步更新的表单字段")
      .optional(),
    role_owners: z
      .array(
        z.object({
          role: z.string().describe("角色 ID"),
          owners: z.array(z.string()).describe("人员 user_key 列表"),
        }),
      )
      .describe("流转时同步设置的角色人员")
      .optional(),
  }),

  // ── 创建与终止 ────────────────────────────────────────
  z.object({
    action: z
      .literal("create_work_item")
      .describe(
        "在指定空间和工作项类型下创建一个新实例。name 为必填（可通过 name 参数或 field_value_pairs 中 field_key=name 提供）。创建成功后 data 字段返回新工作项 ID。可选传入 field_value_pairs 设置初始字段值、template_id 使用模板。",
      ),
    ...WorkItemLocator,
    name: z
      .string()
      .describe(
        "工作项名称/标题（必填，也可通过 field_value_pairs 中的 name 字段提供）",
      )
      .optional(),
    field_value_pairs: z
      .array(
        z.object({
          field_key: z.string().describe("字段 key"),
          field_value: z.any().describe("字段值，格式参考 field_value 格式速查"),
          field_type_key: z
            .string()
            .describe("字段类型标识（可选，如 select、user 等）")
            .optional(),
        }),
      )
      .describe(
        '初始字段值列表。示例：[{ "field_key": "priority", "field_value": { "value": "0" } }]',
      )
      .optional(),
    template_id: z
      .number()
      .describe("模板 ID，使用指定模板创建工作项")
      .optional(),
  }),
  z.object({
    action: z
      .literal("abort_work_item")
      .describe(
        "终止或恢复工作项。默认终止（is_aborted=true），传 is_aborted=false 可恢复已终止的工作项。飞书项目不提供真正的删除 API，终止是最接近的操作。",
      ),
    ...WorkItemLocator,
    is_aborted: z
      .boolean()
      .describe(
        "true=终止（默认），false=恢复已终止的工作项",
      )
      .optional(),
    reason: z
      .string()
      .describe('终止或恢复的原因说明（如 "重复需求" "测试清理"）')
      .optional(),
  }),
]);

/** 插件配置 Zod Schema。 */
const LarkProjectConfigSchema = z.object({
  pluginId: z.string().min(1, "pluginId 不能为空"),
  pluginSecret: z.string().min(1, "pluginSecret 不能为空"),
  userKey: z.string().min(1, "userKey 不能为空"),
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
 * - 注册单一 `lark_project` 工具，通过 `action` 字段分发
 */
const larkProjectPlugin = {
  id: "openclaw-lark-project",
  name: "Lark Project",
  description:
    "飞书项目工作项管理：创建/终止工作项、更新字段（含描述、业务线等）、管理评论、修改角色人员、获取业务线列表、节点流转与状态流转。",
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
          "管理飞书项目工作项：创建/终止工作项、更新字段（含描述、业务线等）、修改角色人员、添加/查询/删除评论、获取业务线列表、节点流转。通过 action 字段选择操作。",
        parameters: z.toJSONSchema(LarkProjectToolSchema),

        async execute(
          _toolCallId: string,
          params: z.infer<typeof LarkProjectToolSchema>,
        ) {
          try {
            switch (params.action) {
              case "create_work_item_comment":
                return json(await client.createWorkItemComment(params));

              case "list_work_item_comments":
                return json(await client.listWorkItemComments(params));

              case "delete_work_item_comment":
                return json(await client.deleteWorkItemComment(params));

              case "update_work_item_role_owners":
                return json(await client.updateWorkItemRoleOwners(params));

              case "update_work_item_field":
                return json(await client.updateWorkItemField(params));

              case "list_businesses":
                return json(
                  await client.listBusinesses({
                    project_key: params.project_key,
                  }),
                );

              case "get_work_item_workflow":
                return json(await client.getWorkItemWorkflow(params));

              case "confirm_node":
                return json(await client.confirmNode(params));

              case "rollback_node":
                return json(await client.rollbackNode(params));

              case "change_state":
                return json(await client.changeState(params));

              case "create_work_item":
                return json(await client.createWorkItem(params));

              case "abort_work_item":
                return json(await client.abortWorkItem(params));

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
