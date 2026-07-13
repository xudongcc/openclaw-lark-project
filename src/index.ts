import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { z } from "zod/v4";
import { LarkProjectClient } from "./client/client.js";
import { LarkProjectMCPClient } from "./client/mcp-client.js";
import { toJSONSchema } from "./client/utils/to-json-schema.js";

import {
  CreateWorkItemParamsSchema,
  AbortWorkItemParamsSchema,
  GetWorkItemParamsSchema,
  GetWorkItemSchemaParamsSchema,
  UpdateWorkItemParamsSchema,
  UpdateWorkItemRoleOwnersParamsSchema,
  GetWorkItemWorkflowParamsSchema,
  ConfirmNodeParamsSchema,
  RollbackNodeParamsSchema,
  ChangeStateParamsSchema,
  GetBusinessesParamsSchema,
} from "./client/schemas/work-item.js";

import {
  CreateCommentParamsSchema,
  GetCommentsParamsSchema,
  UpdateCommentParamsSchema,
  DeleteCommentParamsSchema,
} from "./client/schemas/comment.js";

import { GetViewDetailParamsSchema } from "./client/schemas/view.js";

import {
  GetUserParamsSchema,
  GetUsersByUserKeysParamsSchema,
} from "./client/schemas/user.js";

import { GetTeamsParamsSchema } from "./client/schemas/team.js";
import {
  GetScheduleParamsSchema,
  SearchByMqlParamsSchema,
} from "./client/schemas/mcp.js";

// ── 插件配置 ──

const LarkProjectConfigSchema = z.object({
  pluginId: z.string().min(1, "pluginId 不能为空"),
  pluginSecret: z.string().min(1, "pluginSecret 不能为空"),
  userKey: z.string().min(1, "userKey 不能为空"),
  mcpKey: z.string().min(1, "mcpKey 不能为空"),
});

const configSchema = {
  parse(value: unknown): z.infer<typeof LarkProjectConfigSchema> {
    return LarkProjectConfigSchema.parse(value ?? {});
  },
};

/**
 * OpenClaw 插件定义。
 *
 * 注册多个独立工具，工具命名规则：lark_project_{资源}_{动作}
 */
const larkProjectPlugin = {
  id: "openclaw-lark-project",
  name: "Lark Project",
  description:
    "飞书项目工作项管理：支持创建/终止工作项、更新字段（含描述、业务线等）、管理评论、修改角色人员、获取组织架构数据、节点与状态流转以及复杂的数据查询。",
  configSchema,

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

    const json = (payload: unknown) => ({
      content: [
        { type: "text" as const, text: JSON.stringify(payload, null, 2) },
      ],
      details: payload,
    });

    // ── Work Item ──

    api.registerTool(
      {
        name: "lark_project_work_item_create",
        label: "lark_project_work_item_create",
        description:
          "创建工作项实例，一次只能创建一条工作项实例，创建成功后，会获得对应的详情页url。",
        parameters: toJSONSchema(CreateWorkItemParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.createWorkItem(
                CreateWorkItemParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_work_item_abort",
        label: "lark_project_work_item_abort",
        description:
          "终止或恢复工作项。默认终止（is_aborted=true），传 is_aborted=false 可恢复已终止的工作项。飞书项目不提供真正的删除 API，终止是最接近的操作。",
        parameters: toJSONSchema(AbortWorkItemParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.abortWorkItem(
                AbortWorkItemParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_work_item_get",
        label: "lark_project_work_item_get",
        description:
          "获取一个工作项实例的概况，包括所有字段、当前节点、状态等信息。",
        parameters: toJSONSchema(GetWorkItemParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getWorkItem(GetWorkItemParamsSchema.parse(params)),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_work_item_schema_get",
        label: "lark_project_work_item_schema_get",
        description:
          "获取一个工作项类型具备的可用字段与角色信息。返回 fields（字段 key、名称、类型、选项列表）和 roles（角色 ID、名称）。用于在更新字段或角色前了解可用的字段和角色。",
        parameters: toJSONSchema(GetWorkItemSchemaParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getWorkItemSchema(
                GetWorkItemSchemaParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_work_item_update",
        label: "lark_project_work_item_update",
        description:
          '更新工作项的任意字段（含描述、业务线、优先级等）。字段 key 和格式可通过 lark_project_work_item_schema_get 获取。各类型 field_value 格式：单选（priority 等）→ { "label": "P0", "value": "0" }；业务线（business）→ 业务线 ID 字符串（非名称，通过 lark_project_business_list 获取）；文本 → 字符串；数字 → 数值；人员 → user_key 字符串或数组；日期 → 毫秒时间戳；描述（description）→ markdown 字符串。',
        parameters: toJSONSchema(UpdateWorkItemParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.updateWorkItem(
                UpdateWorkItemParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_work_item_role_update",
        label: "lark_project_work_item_role_update",
        description:
          "覆盖更新工作项的角色人员名单。⚠️ 这是覆盖更新，必须传入所有角色及其人员，未传入的角色人员会被清空。更新前应先通过 lark_project_work_item_get 获取当前角色列表，角色 ID 可通过 lark_project_work_item_schema_get 查询。",
        parameters: toJSONSchema(UpdateWorkItemRoleOwnersParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.updateWorkItemRoleOwners(
                UpdateWorkItemRoleOwnersParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    // ── View ──

    api.registerTool(
      {
        name: "lark_project_view_get",
        label: "lark_project_view_get",
        description:
          "获取指定视图下的工作项列表及详情。返回视图名称、工作项 ID 列表和每个工作项的完整详情。",
        parameters: toJSONSchema(GetViewDetailParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getViewDetail(
                GetViewDetailParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    // ── Workflow ──

    api.registerTool(
      {
        name: "lark_project_workflow_get",
        label: "lark_project_workflow_get",
        description:
          "获取工作项的工作流详情，自动区分节点流和状态流。节点流返回：workflow_nodes（节点数组，status: 1=未到达 2=已到达 3=已通过）和 connections。状态流返回：state_flow_nodes（状态节点数组，status: 2=当前状态）和 connections（含 transition_id，用于 lark_project_state_change）。在执行 lark_project_node_confirm / lark_project_node_rollback 或 lark_project_state_change 前必须先调用此工具。",
        parameters: toJSONSchema(GetWorkItemWorkflowParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getWorkflow(
                GetWorkItemWorkflowParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_node_confirm",
        label: "lark_project_node_confirm",
        description:
          "【仅节点流】完成指定节点，将其从「已到达」（status=2）推进到「已通过」。使用前需先调用 lark_project_workflow_get 获取 node_id。confirm 时建议传入 node_owners。可同时更新表单字段和角色负责人。",
        parameters: toJSONSchema(ConfirmNodeParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.confirmNode(ConfirmNodeParamsSchema.parse(params)),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_node_rollback",
        label: "lark_project_node_rollback",
        description:
          "【仅节点流】回滚指定节点，将已完成（status=3）的节点退回到「已到达」。使用前需先调用 lark_project_workflow_get 获取 node_id。必须提供 rollback_reason。",
        parameters: toJSONSchema(RollbackNodeParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.rollbackNode(RollbackNodeParamsSchema.parse(params)),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_state_change",
        label: "lark_project_state_change",
        description:
          "【仅状态流】执行工作项状态流转。transition_id 需先通过 lark_project_workflow_get 获取：从 state_flow_nodes 找到当前状态（status=2），再从 connections 找 source_state_key 匹配的 transition_id。可同时更新表单字段和角色人员。",
        parameters: toJSONSchema(ChangeStateParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.changeState(ChangeStateParamsSchema.parse(params)),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    // ── Comment ──

    api.registerTool(
      {
        name: "lark_project_comment_create",
        label: "lark_project_comment_create",
        description:
          "在工作项下添加一条纯文本评论。返回新评论 ID（data 字段）。适用于自动化记录进展、留言通知等场景。",
        parameters: toJSONSchema(CreateCommentParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.createComment(
                CreateCommentParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_comment_list",
        label: "lark_project_comment_list",
        description:
          "获取工作项的所有评论列表。返回评论数组，每条包含 id、content、author、created_at、is_mine、can_update、can_delete 等字段。",
        parameters: toJSONSchema(GetCommentsParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getComments(GetCommentsParamsSchema.parse(params)),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_comment_update",
        label: "lark_project_comment_update",
        description: "更新工作项下的指定评论。仅评论创建人有权更新。",
        parameters: toJSONSchema(UpdateCommentParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.updateComment(
                UpdateCommentParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_comment_delete",
        label: "lark_project_comment_delete",
        description:
          "删除工作项下的指定评论。仅评论创建人有权删除。comment_id 可通过 lark_project_comment_list 获取。",
        parameters: toJSONSchema(DeleteCommentParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.deleteComment(
                DeleteCommentParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    // ── Data Query ──

    api.registerTool(
      {
        name: "lark_project_search_by_mql",
        label: "lark_project_search_by_mql",
        description:
          "使用 MOQL（类 SQL）语法查询飞书项目工作项。支持按字段筛选、排序、分页，适用于批量检索需求、缺陷等。语法详见参数 moql 的说明。",
        parameters: toJSONSchema(SearchByMqlParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await mcpClient.searchByMql(
                SearchByMqlParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_schedule_get",
        label: "lark_project_schedule_get",
        description:
          "获取指定空间下指定人员在指定时间区间内的个人排期与工作量明细，支持多用户、多工作项类型聚合展示。应用场景：团队人力分析、排期评审、识别超载/空闲成员、评估迭代与项目整体容量。",
        parameters: toJSONSchema(GetScheduleParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await mcpClient.getSchedule(
                GetScheduleParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    // ── Organization ──

    api.registerTool(
      {
        name: "lark_project_user_get",
        label: "lark_project_user_get",
        description: "通过 ID、名称或邮箱精确获取单个用户详情。",
        parameters: toJSONSchema(GetUserParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            const user = await client.getUser(
              GetUserParamsSchema.parse(params),
            );
            return json({
              data: user ? [user] : [],
              err_code: 0,
              err_msg: "",
              err: {},
            });
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_user_list",
        label: "lark_project_user_list",
        description:
          "批量查询用户详情。根据 user_key 列表获取用户的详细信息。每次最多查询 100 个用户。",
        parameters: toJSONSchema(GetUsersByUserKeysParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getUsersByUserKeys(
                GetUsersByUserKeysParamsSchema.parse(params),
              ),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_team_list",
        label: "lark_project_team_list",
        description:
          "获取指定空间下的团队人员列表。返回团队 ID、团队名称、人员列表。设置 include_user_detail=true 时自动查询用户详情。",
        parameters: toJSONSchema(GetTeamsParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getTeams(GetTeamsParamsSchema.parse(params)),
            );
          } catch (err: any) {
            return json({ error: err?.message || String(err) });
          }
        },
      },
      { optional: true },
    );

    api.registerTool(
      {
        name: "lark_project_business_list",
        label: "lark_project_business_list",
        description:
          "获取指定空间下的所有业务线列表，返回每条业务线的 id 和 name。用于更新业务线字段前获取正确的业务线 ID。",
        parameters: toJSONSchema(GetBusinessesParamsSchema),
        execute: async (_id: string, params: unknown) => {
          try {
            return json(
              await client.getBusinesses(
                GetBusinessesParamsSchema.parse(params),
              ),
            );
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
