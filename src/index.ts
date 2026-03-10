import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { z } from "zod/v4";
import { LarkProjectClient } from "./client/client";
import { LarkProjectMCPClient } from "./client/mcp-client";

import {
  CreateWorkItemParamsSchema,
  AbortWorkItemParamsSchema,
  GetWorkItemParamsSchema,
  GetWorkItemSchemaParamsSchema,
  UpdateWorkItemFieldParamsSchema,
  UpdateWorkItemRoleOwnersParamsSchema,
  GetWorkItemWorkflowParamsSchema,
  ConfirmNodeParamsSchema,
  RollbackNodeParamsSchema,
  ChangeStateParamsSchema,
  GetBusinessesParamsSchema,
} from "./client/schemas/work-item";

import {
  CreateCommentParamsSchema,
  GetCommentsParamsSchema,
  UpdateCommentParamsSchema,
  DeleteCommentParamsSchema,
} from "./client/schemas/comment";

import { GetViewDetailParamsSchema } from "./client/schemas/view";

import {
  GetUserParamsSchema,
  SearchUsersParamsSchema,
  GetUsersByIdsParamsSchema,
} from "./client/schemas/user";

import { GetTeamsParamsSchema } from "./client/schemas/team";

// ── 统一工具 Schema ──────────────────────────────────────────
const LarkProjectToolSchema = z.discriminatedUnion("action", [
  // ── Work Item ──
  z.object({
    action: z
      .literal("create_work_item")
      .describe(
        "创建工作项实例，一次只能创建一条工作项实例，创建成功后，会获得对应的详情页url。",
      ),
    params: CreateWorkItemParamsSchema,
  }),
  z.object({
    action: z
      .literal("abort_work_item")
      .describe(
        "终止或恢复工作项。默认终止（is_aborted=true），传 is_aborted=false 可恢复已终止的工作项。飞书项目不提供真正的删除 API，终止是最接近的操作。",
      ),
    params: AbortWorkItemParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_work_item")
      .describe(
        "获取一个工作项实例的概况，包括所有字段、当前节点、状态等信息。",
      ),
    params: GetWorkItemParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_view_detail")
      .describe(
        "获取指定视图下的工作项列表及详情。返回视图名称、工作项 ID 列表和每个工作项的完整详情。",
      ),
    params: GetViewDetailParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_work_item_schema")
      .describe(
        "获取一个工作项类型具备的可用字段与角色信息。返回 fields（字段 key、名称、类型、选项列表）和 roles（角色 ID、名称）。用于在更新字段或角色前了解可用的字段和角色。",
      ),
    params: GetWorkItemSchemaParamsSchema,
  }),
  z.object({
    action: z
      .literal("update_work_item")
      .describe(
        '更新工作项的任意字段（含描述、业务线、优先级等）。字段 key 和格式可通过 get_work_item_schema 获取。各类型 field_value 格式：单选（priority 等）→ { "label": "P0", "value": "0" }；业务线（business）→ 业务线 ID 字符串（非名称，通过 get_businesses 获取）；文本 → 字符串；数字 → 数值；人员 → id 字符串或数组；日期 → 毫秒时间戳；描述（description）→ markdown 字符串。',
      ),
    params: UpdateWorkItemFieldParamsSchema,
  }),
  z.object({
    action: z
      .literal("update_work_item_role_owners")
      .describe(
        "覆盖更新工作项的角色人员名单。⚠️ 这是覆盖更新，必须传入所有角色及其人员，未传入的角色人员会被清空。更新前应先通过 get_work_item 获取当前角色列表，角色 ID 可通过 get_work_item_schema 查询。",
      ),
    params: UpdateWorkItemRoleOwnersParamsSchema,
  }),
  // ── Workflow ──
  z.object({
    action: z
      .literal("get_workflow")
      .describe(
        "获取工作项的工作流详情，自动区分节点流和状态流。节点流返回：workflow_nodes（节点数组，status: 1=未到达 2=已到达 3=已通过）和 connections。状态流返回：state_flow_nodes（状态节点数组，status: 2=当前状态）和 connections（含 transition_id，用于 change_state）。在执行 confirm_node / rollback_node 或 change_state 前必须先调用此接口。",
      ),
    params: GetWorkItemWorkflowParamsSchema,
  }),
  z.object({
    action: z
      .literal("confirm_node")
      .describe(
        "【仅节点流】完成指定节点，将其从「已到达」（status=2）推进到「已通过」。使用前需先调用 get_workflow 获取 node_id。confirm 时建议传入 node_owners。可同时更新表单字段和角色负责人。",
      ),
    params: ConfirmNodeParamsSchema,
  }),
  z.object({
    action: z
      .literal("rollback_node")
      .describe(
        "【仅节点流】回滚指定节点，将已完成（status=3）的节点退回到「已到达」。使用前需先调用 get_workflow 获取 node_id。必须提供 rollback_reason。",
      ),
    params: RollbackNodeParamsSchema,
  }),
  z.object({
    action: z
      .literal("change_state")
      .describe(
        "【仅状态流】执行工作项状态流转。transition_id 需先通过 get_workflow 获取：从 state_flow_nodes 找到当前状态（status=2），再从 connections 找 source_state_key 匹配的 transition_id。可同时更新表单字段和角色人员。",
      ),
    params: ChangeStateParamsSchema,
  }),
  // ── Comment ──
  z.object({
    action: z
      .literal("create_comment")
      .describe(
        "在工作项下添加一条纯文本评论。返回新评论 ID（data 字段）。适用于自动化记录进展、留言通知等场景。",
      ),
    params: CreateCommentParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_comments")
      .describe(
        "获取工作项的所有评论列表。返回评论数组，每条包含 id、content、creator、created_at 等字段。可用于在删除前查找 comment_id。",
      ),
    params: GetCommentsParamsSchema,
  }),
  z.object({
    action: z
      .literal("update_comment")
      .describe("更新工作项下的指定评论。仅评论创建人有权更新。"),
    params: UpdateCommentParamsSchema,
  }),
  z.object({
    action: z
      .literal("delete_comment")
      .describe(
        "删除工作项下的指定评论。仅评论创建人有权删除。comment_id 可通过 get_comments 获取。",
      ),
    params: DeleteCommentParamsSchema,
  }),
  // ── Data Query ──
  z.object({
    action: z
      .literal("search_by_mql")
      .describe(
        "使用MOQL进行Meego数据的查询。MOQL本身是SQL查询语言的能力扩展。使用该工具要遵循以下步骤：" +
          "1.理解意图：分析用户的自然语言请求，明确其核心目标，从中提取出空间、工作项类型两个关键信息，如果提取不到，可以追问用户。" +
          "2.请务必使用步骤1得到的空间key、工作项类型，使用get_work_item_schema来确认要查询的空间以及工作类型，如果查不到信息，请直接报错不要继续。" +
          "3.按照用户的意图按需查询，select后跟的属性不宜过多。务必使用第二个步骤里获取到的可读性强的名称去写moql，比如可以写select `任务名称`，避免写select `name`。" +
          "4.按照moql的语法规范来写moql语句。",
      ),
    params: z
      .object({
        project_key: z
          .string()
          .describe(
            "要查询的工作项类型所属的空间projectKey或simpleName或空间名",
          ),
        session_id: z
          .string()
          .describe(
            "sessionID，传sessionID时不会解析MOQL，直接根据sessionID查询之前的数据。该信息会在exec_moql接口返回体里返回。主要用于分页查询。",
          )
          .optional(),
        group_pagination_list: z
          .array(
            z.object({
              group_id: z
                .string()
                .describe("分组ID（从上一次接口返回中获取`group_id`）")
                .optional(),
              page_num: z.number().describe("页码，从1开始，每页50条"),
            }),
          )
          .describe(
            "分页信息。首次查询时可不传（默认返回第一页，最多50条数据）。后续分页可传入该字段+session_id。",
          )
          .optional(),
        moql: z
          .string()
          .describe(
            "要执行的moql语句。\n" +
              "语法规范如下：\n" +
              "- 支持现有的Mysql语法。现有的Mysql函数。\n" +
              "- 提供数组判断方法，通过返回bool类型来表示是否满足条件。包含两个入参：array_col是array类型的列；predicate是lambda_expr类型的表达式，表示判断条件。举例：all_match(ary_col, x -> x > 10)，判断ary_col中是否每个元素都大于10。\n" +
              "  - all_match(array_col, predicate): array中是否所有element都满足特定条件\n" +
              "  - any_match(array_col, predicate): array中是否有一个element满足特定条件\n" +
              "  - none_match(array_col, predicate): array中是否所有element都不满足特定条件\n" +
              "  - array_contains(array_col, element): array中是否包含element\n" +
              "- 提供数组数据处理方法：\n" +
              "  - array_cardinality(array_col): 返回一个array的元素个数（bigint）\n" +
              "  - array_filter(array_col, predicate): 根据lambda_func对array进行过滤，返回过滤后的新数组（array）\n" +
              "- 提供团队与人员方法：\n" +
              "  - current_login_user(): 当前登录用户，返回userkey\n" +
              "  - team(include_manager, team_name): 表示名字为team_name的团队。入参：include_manager(bool)表示是否包含管理者；team_name(varchar)表示团队名称。返回array(varchar)类型。举例：team(true, '后端开发团队')\n" +
              "  - participate_roles(): 返回array(varchar)，表示所有参与角色的rolekey\n" +
              "  - all_participate_persons(): 返回array(varchar)，表示所有参与人的userkey\n" +
              "- 提供时间判断方法，返回bool类型来表示是否满足条件：\n" +
              "  - 入参：col_name(date或datetime类型)；date_para可选值：today/tomorrow/yesterday/current_week/next_week/last_week/current_month/next_month/last_month/future/past；days(varchar，可选，在date_para等于future、past、today时表示偏移天数)\n" +
              "  - RELATIVE_DATETIME_EQ(col_name, 'date_para', ['days']): 等于某一特定相对时间\n" +
              "  - RELATIVE_DATETIME_GT(col_name, 'date_para', ['days']): 大于某一特定相对时间\n" +
              "  - RELATIVE_DATETIME_GE(col_name, 'date_para', ['days']): 大于等于某一特定相对时间\n" +
              "  - RELATIVE_DATETIME_LT(col_name, 'date_para', ['days']): 小于某一特定相对时间\n" +
              "  - RELATIVE_DATETIME_LE(col_name, 'date_para', ['days']): 小于等于某一特定相对时间\n" +
              "  - RELATIVE_DATETIME_BETWEEN(col_name, 'date_para', ['days']): 属于某一特定相对时间\n" +
              "  - 举例：RELATIVE_DATETIME_EQ(`创建时间`, 'today')表示创建时间等于今天；RELATIVE_DATETIME_EQ(`创建时间`, 'today', '3d')表示创建时间等于今天后3天\n" +
              "MOQL示例：\n" +
              "1. select `工作项id` from `测试空间`.`需求` where `是否冻结` = 0; 查询所有未冻结的需求工作项ID\n" +
              "2. select `工作项id` from `测试空间`.`需求` where `名称` like '%a%'; 查询所有名称中包含字母a的需求工作项ID\n" +
              "3. select `工作项id` from `测试空间`.`需求` where any_match(`当前负责人`, x -> x in (current_login_user(), '小李')); 当前负责人存在选项等于小李\n" +
              "4. select `工作项id` from `测试空间`.`需求` where any_match(`当前负责人`, usr -> usr in team(include_manager, '团队1') OR usr in ('小王')); 当前负责人在团队1里或者等于小王\n" +
              "5. SELECT `工作项id` FROM `测试空间`.`需求` WHERE `__开发周期_开始时间` > '2025-01-01' AND `__开发周期_结束时间` < '2025-01-31'; 当要查询的属性为schedule类型时，请以带__A_B的特殊格式请求\n" +
              "6. 对于角色的查询，需要以带__前缀的特殊格式请求，比如查询RD：SELECT `工作项id` FROM `测试空间`.`需求` WHERE array_contains(__RD, '张三');",
          )
          .optional(),
        page_num: z
          .number()
          .describe(
            "页码，从1开始。此参数为快捷分页参数，也可使用 group_pagination_list 实现更复杂的分页",
          )
          .optional(),
      })
      .describe("MOQL查询的参数"),
  }),
  z.object({
    action: z
      .literal("get_schedule")
      .describe(
        "获取指定空间（project_key）下指定人员（id）在指定时间区间内的个人排期与工作量明细，支持多用户、多工作项类型聚合展示。应用场景：团队人力分析、排期评审、识别超载/空闲成员、评估迭代与项目整体容量。与search_by_mql需要精确入参查询语句才能返回工作项列表不同，本工具可以精确查询指定用户在节点/子任务/工作项上的排期和估分数据。返回说明：返回user_workload_list+total，其中每个用户包含基础信息、排期任务明细（含状态、节点、子任务时间等）及总估分、未排期任务数量等汇总字段。",
      ),
    params: z
      .object({
        project_key: z
          .string()
          .describe(
            "传入要查询的工作项所属空间标识。支持直接输入空间的projectKey、空间名称或simple_name",
          ),
        start_time: z
          .string()
          .describe(
            "传入查询排期的时间范围（最大不超过3个月）开始时间，请严格按照以下格式输入：2006-01-01",
          ),
        end_time: z
          .string()
          .describe(
            "传入查询排期的时间范围结束时间（最大不超过3个月），请严格按照以下格式输入：2006-01-01",
          ),
        user_ids: z
          .array(z.string())
          .describe(
            "传入要查询排期的用户的唯一标识，支持输入名称、邮箱、id 或 user_id，支持传入多个，最多支持 20 个",
          ),
        work_item_type_keys: z
          .array(z.string())
          .describe(
            "要查询的个人任务的唯一标识，支持输入名称、系统标识或work_item_type_key，如story、需求、issue、缺陷、子任务、sub_task等。查询所有工作项类型时可以传入_all",
          )
          .optional(),
      })
      .describe("日程排期查询的参数"),
  }),
  // ── Organization ──
  z.object({
    action: z
      .literal("get_user")
      .describe(
        "通过 ID、名称或邮箱精确获取单个用户详情。",
      ),
    params: GetUserParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_users_by_ids")
      .describe(
        "批量查询用户详情。根据 id 列表获取用户的详细信息。每次最多查询 100 个用户。",
      ),
    params: GetUsersByIdsParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_teams")
      .describe(
        "获取指定空间下的团队人员列表。返回团队 ID、团队名称、人员列表（user_ids）、管理员列表（administrators）、成员列表（members）。设置 include_user_detail=true 时自动查询用户详情，返回 user_details 映射（含 name_cn、email、avatar_url、status 等）。",
      ),
    params: GetTeamsParamsSchema,
  }),
  z.object({
    action: z
      .literal("get_businesses")
      .describe(
        "获取指定空间下的所有业务线列表，返回每条业务线的 id 和 name。用于更新业务线字段前获取正确的业务线 ID（业务线字段的 field_value 必须传 ID 而非名称）。",
      ),
    params: GetBusinessesParamsSchema,
  }),
]);

/** 插件配置 Zod Schema。 */
const LarkProjectConfigSchema = z.object({
  pluginId: z.string().min(1, "pluginId 不能为空"),
  pluginSecret: z.string().min(1, "pluginSecret 不能为空"),
  userKey: z.string().min(1, "userKey 不能为空"),
  mcpKey: z.string().min(1, "mcpKey 不能为空"),
});

/**
 * 插件配置 Schema，符合 {@link OpenClawPluginConfigSchema} 接口。
 *
 * @remarks
 * - `parse` 使用 `LarkProjectConfigSchema` 验证并规范化配置
 */
const configSchema = {
  parse(value: unknown): z.infer<typeof LarkProjectConfigSchema> {
    return LarkProjectConfigSchema.parse(value ?? {});
  },
};

/**
 * OpenClaw 插件定义（对象式导出）。
 *
 * @remarks
 * 注册单一工具 `lark_project`，通过 `action` 字段路由到各功能。
 */
const larkProjectPlugin = {
  id: "openclaw-lark-project",
  name: "Lark Project",
  description:
    "飞书项目工作项管理：支持创建/终止工作项、更新字段（含描述、业务线等）、管理评论、修改角色人员、获取组织架构数据、节点与状态流转以及复杂的数据查询。",
  configSchema,

  /**
   * 插件注册入口，由 openclaw 运行时调用。
   *
   * @param api - openclaw 插件 API
   */
  register(api: OpenClawPluginApi) {
    const config = configSchema.parse(api.pluginConfig);

    const client = new LarkProjectClient({
      pluginId: config.pluginId,
      pluginSecret: config.pluginSecret,
      userKey: config.userKey,
    });

    const mcpClient = new LarkProjectMCPClient({
      mcpKey: config.mcpKey,
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
          "飞书项目管理工具：支持工作项 CRUD、工作流推进（节点流/状态流）、评论管理、MOQL 数据查询、排期分析、组织架构查询。通过 action 字段选择具体操作。",
        parameters: z.toJSONSchema(LarkProjectToolSchema),
        execute: async (
          _toolCallId: string,
          payload: z.infer<typeof LarkProjectToolSchema>,
        ) => {
          try {
            switch (payload.action) {
              // ── Work Item ──
              case "create_work_item":
                return json(await client.createWorkItem(payload.params));
              case "abort_work_item":
                return json(await client.abortWorkItem(payload.params));
              case "get_work_item":
                return json(await client.getWorkItem(payload.params));
              case "get_view_detail":
                return json(await client.getViewDetail(payload.params));
              case "get_work_item_schema":
                return json(await client.getWorkItemSchema(payload.params));
              case "update_work_item":
                return json(await client.updateWorkItem(payload.params));
              case "update_work_item_role_owners":
                return json(
                  await client.updateWorkItemRoleOwners(payload.params),
                );
              // ── Workflow ──
              case "get_workflow":
                return json(await client.getWorkflow(payload.params));
              case "confirm_node":
                return json(await client.confirmNode(payload.params));
              case "rollback_node":
                return json(await client.rollbackNode(payload.params));
              case "change_state":
                return json(await client.changeState(payload.params));
              // ── Comment ──
              case "create_comment":
                return json(await client.createComment(payload.params));
              case "get_comments":
                return json(await client.getComments(payload.params));
              case "update_comment":
                return json(await client.updateComment(payload.params));
              case "delete_comment":
                return json(await client.deleteComment(payload.params));
              // ── Data Query ──
              case "search_by_mql":
                return json(await mcpClient.searchByMql(payload.params));
              case "get_schedule":
                return json(await mcpClient.getSchedule(payload.params));
              // ── Organization ──
              case "get_user": {
                const user = await client.getUser(payload.params);
                return json({
                  data: user ? [user] : [],
                  err_code: 0,
                  err_msg: "",
                  err: {},
                });
              }
              case "get_users_by_ids":
                return json(await client.getUsersByIds(payload.params));
              case "get_teams":
                return json(await client.getTeams(payload.params));
              case "get_businesses":
                return json(await client.getBusinesses(payload.params));
              default:
                // @ts-expect-error fallback
                return json({ error: `未知的工具动作: ${payload.action}` });
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
