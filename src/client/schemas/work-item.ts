import { z } from "zod";
import {
  type LarkProjectResponse,
  createLarkProjectResponseSchema,
  WorkItemLocatorSchema,
  msToDate,
} from "./common";
import type { WorkItemLocator } from "./common";

// ── 工作项实体类型 ──────────────────────────────────────

/** 工作项字段值对 */
export const WorkItemFieldSchema = z.object({
  /** 字段唯一标识 */
  field_key: z.string(),
  /** 字段值，类型取决于 field_type_key */
  field_value: z.unknown(),
  /** 字段类型标识（如 select / date / bool / multi_text 等） */
  field_type_key: z.string(),
  /** 字段别名 */
  field_alias: z.string(),
  /** 帮助描述 */
  help_description: z.string(),
});

export type WorkItemField = z.infer<typeof WorkItemFieldSchema>;

/** 工作流节点 */
export const WorkItemNodeSchema = z.object({
  /** 节点 ID（如 "start" / "doing" / "end"） */
  id: z.string(),
  /** 节点名称 */
  name: z.string(),
  /** 负责人 id 列表 */
  owners: z.array(z.string()),
  /** 是否为里程碑节点 */
  milestone: z.boolean(),
});

export type WorkItemNode = z.infer<typeof WorkItemNodeSchema>;

/** 工作项状态变更记录 */
export const WorkItemStatusRecordSchema = z.object({
  state_key: z.string(),
  is_archived_state: z.boolean(),
  is_init_state: z.boolean(),
  updated_at: msToDate,
  updated_by: z.string(),
});

export type WorkItemStatusRecord = z.infer<typeof WorkItemStatusRecordSchema>;

/** 工作项当前状态 */
export const WorkItemStatusSchema = z.object({
  state_key: z.string(),
  is_archived_state: z.boolean(),
  is_init_state: z.boolean(),
  updated_at: msToDate,
  updated_by: z.string(),
  /** 状态变更历史（filter API 可能返回） */
  history: z.array(WorkItemStatusRecordSchema).optional(),
});

export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

/** 节点停留时间 */
export const StateTimeSchema = z.object({
  state_key: z.string(),
  /** 节点名称 */
  name: z.string(),
  /** 进入时间戳（毫秒） */
  start_time: msToDate,
  /** 离开时间戳（毫秒），0 表示仍在该节点 */
  end_time: msToDate,
});

export type StateTime = z.infer<typeof StateTimeSchema>;

/** 工作项完整详情（filter API 返回） */
export const WorkItemSchema = z.object({
  /** 工作项 ID */
  id: z.union([z.number(), z.string()]),
  /** 工作项名称 */
  name: z.string(),
  /** 工作项类型标识（如 story / issue） */
  work_item_type_key: z.string(),
  /** 空间 project_key */
  project_key: z.string(),
  /** 空间域名（simple_name） */
  simple_name: z.string(),
  /** 工作流模式（如 "Node" / "State"） */
  pattern: z.string(),
  /** 子阶段（如 "started"） */
  sub_stage: z.string(),
  /** 模板 ID */
  template_id: z.number(),
  /** 模板类型标识 */
  template_type: z.string(),
  /** 创建人 id */
  created_by: z.string(),
  /** 创建时间戳（毫秒） */
  created_at: msToDate,
  /** 最后修改人 id */
  updated_by: z.string(),
  /** 最后修改时间戳（毫秒） */
  updated_at: z.coerce.date(),
  /** 删除人 id，空字符串表示未删除 */
  deleted_by: z.string(),
  /** 删除时间戳（毫秒），0 表示未删除 */
  deleted_at: msToDate,
  /** 当前所处节点列表 */
  current_nodes: z.array(WorkItemNodeSchema).optional(),
  /** 当前工作项状态 */
  work_item_status: WorkItemStatusSchema.optional(),
  /** 各节点停留时间 */
  state_times: z.array(StateTimeSchema).optional(),
  /** 工作项字段列表 */
  fields: z.array(WorkItemFieldSchema).optional(),
});

export type WorkItem = z.infer<typeof WorkItemSchema>;

// ── 工作项操作参数 ──────────────────────────────────────

export const UpdateWorkItemFieldParamsSchema = WorkItemLocatorSchema.extend({
  update_fields: z
    .array(
      z.object({
        field_key: z
          .string()
          .describe(
            '字段 key，如 "description"、"priority"、"business"。可通过 get_work_item_schema 获取可用字段列表',
          ),
        field_value: z
          .any()
          .describe(
            "字段值，格式随字段类型变化。单选传 {label, value} 对象；业务线传 ID 字符串；描述传 markdown 字符串；日期传毫秒时间戳；人员传 id 字符串或数组",
          ),
      }),
    )
    .min(1)
    .describe(
      '要更新的字段列表。示例：[{ "field_key": "priority", "field_value": { "label": "P0", "value": "0" } }]',
    ),
}).describe(
  '更新工作项的任意字段（含描述、业务线、优先级等）。字段 key 和格式可通过 get_work_item_schema 获取。各类型 field_value 格式：单选（priority 等）→ { "label": "P0", "value": "0" }；业务线（business）→ 业务线 ID 字符串（非名称，通过 get_businesses 获取）；文本 → 字符串；数字 → 数值；人员 → id 字符串或数组；日期 → 毫秒时间戳；描述（description）→ markdown 字符串。',
);
export type UpdateWorkItemFieldParams = z.input<
  typeof UpdateWorkItemFieldParamsSchema
>;

export const UpdateWorkItemRoleOwnersParamsSchema =
  WorkItemLocatorSchema.extend({
    role_owners: z
      .array(
        z.object({
          role: z
            .string()
            .describe(
              '角色 ID（如 "rd"、"pm"、"qa"），可通过 get_work_item_schema 获取可用角色列表',
            ),
          owners: z
            .array(z.string())
            .describe('该角色的人员 id 列表，如 ["7136000000000000676"]'),
        }),
      )
      .min(1)
      .describe(
        '角色人员数组（覆盖更新）。示例：[{ "role": "rd", "owners": ["7136000000000000676"] }]',
      ),
  }).describe(
    "覆盖更新工作项的角色人员名单。⚠️ 这是覆盖更新，必须传入所有角色及其人员，未传入的角色人员会被清空。更新前应先通过 get_work_item 获取当前角色列表，角色 ID 可通过 get_work_item_schema 查询。",
  );
export type UpdateWorkItemRoleOwnersParams = z.input<
  typeof UpdateWorkItemRoleOwnersParamsSchema
>;

export const GetBusinessesParamsSchema = z
  .object({
    project_key: z
      .string()
      .describe('空间唯一标识（project_key），如 "openclaw"'),
  })
  .describe(
    "获取指定空间下的所有业务线列表，返回每条业务线的 id 和 name。用于更新业务线字段前获取正确的业务线 ID（业务线字段的 field_value 必须传 ID 而非名称）。",
  );
export type GetBusinessesParams = z.input<typeof GetBusinessesParamsSchema>;

export const GetWorkItemWorkflowParamsSchema = WorkItemLocatorSchema.extend(
  {},
).describe(
  "获取工作项的工作流详情，自动区分节点流和状态流。节点流返回：workflow_nodes（节点数组，status: 1=未到达 2=已到达 3=已通过）和 connections。状态流返回：state_flow_nodes（状态节点数组，status: 2=当前状态）和 connections（含 transition_id，用于 change_state）。在执行 confirm_node / rollback_node 或 change_state 前必须先调用此接口。",
);
export type GetWorkItemWorkflowParams = z.input<
  typeof GetWorkItemWorkflowParamsSchema
>;

export const ConfirmNodeParamsSchema = WorkItemLocatorSchema.extend({
  node_id: z
    .string()
    .describe(
      "目标节点 ID（即 workflow_nodes 中的 id/state_key），通过 get_workflow 获取",
    ),
  node_owners: z
    .array(z.string())
    .optional()
    .describe('节点负责人 id 列表，建议传入。如 ["7136000000000000676"]'),
  node_schedule: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("节点排期信息（含开始/结束时间等，格式参考飞书文档）"),
  fields: z
    .array(
      z.object({
        field_key: z.string().describe("表单字段 key"),
        field_value: z.any().describe("字段值"),
      }),
    )
    .optional()
    .describe("流转时同步更新的表单字段"),
  role_assignee: z
    .array(
      z.object({
        role: z.string().describe("角色 ID"),
        owners: z.array(z.string()).describe("人员 id 列表"),
      }),
    )
    .optional()
    .describe("流转时同步分配的角色负责人"),
}).describe(
  "【仅节点流】完成指定节点，将其从「已到达」（status=2）推进到「已通过」。使用前需先调用 get_workflow 获取 node_id。confirm 时建议传入 node_owners。可同时更新表单字段和角色负责人。",
);
export type ConfirmNodeParams = z.input<typeof ConfirmNodeParamsSchema>;

export const RollbackNodeParamsSchema = WorkItemLocatorSchema.extend({
  node_id: z
    .string()
    .describe(
      "目标节点 ID（即 workflow_nodes 中的 id/state_key），通过 get_workflow 获取",
    ),
  rollback_reason: z.string().min(1).describe("回滚原因说明（必填）"),
}).describe(
  "【仅节点流】回滚指定节点，将已完成（status=3）的节点退回到「已到达」。使用前需先调用 get_workflow 获取 node_id。必须提供 rollback_reason。",
);
export type RollbackNodeParams = z.input<typeof RollbackNodeParamsSchema>;

export const ChangeStateParamsSchema = WorkItemLocatorSchema.extend({
  transition_id: z
    .string()
    .describe(
      "流转 ID，从 get_workflow 返回的 connections 数组中获取（匹配 source_state_key 为当前状态的记录）",
    ),
  fields: z
    .array(
      z.object({
        field_key: z.string().describe("表单字段 key"),
        field_value: z.any().describe("字段值"),
      }),
    )
    .optional()
    .describe("流转时同步更新的表单字段"),
  role_owners: z
    .array(
      z.object({
        role: z.string().describe("角色 ID"),
        owners: z.array(z.string()).describe("人员 id 列表"),
      }),
    )
    .optional()
    .describe("流转时同步设置的角色人员"),
}).describe(
  "【仅状态流】执行工作项状态流转。transition_id 需先通过 get_workflow 获取：从 state_flow_nodes 找到当前状态（status=2），再从 connections 找 source_state_key 匹配的 transition_id。可同时更新表单字段和角色人员。",
);
export type ChangeStateParams = z.input<typeof ChangeStateParamsSchema>;

export const CreateWorkItemParamsSchema = WorkItemLocatorSchema.extend({
  name: z
    .string()
    .optional()
    .describe(
      "工作项名称/标题（必填，也可通过 field_value_pairs 中的 name 字段提供）",
    ),
  field_value_pairs: z
    .array(
      z.object({
        field_key: z.string().describe("字段key"),
        field_value: z
          .any()
          .describe(
            "字段值。需注意，时间类的value需要传入16位unix毫秒时间戳，人员类的value需用英文逗号区隔",
          ),
        field_type_key: z
          .string()
          .describe("字段类型标识（可选，如 select、user 等）")
          .optional(),
      }),
    )
    .optional()
    .describe(
      '要创建的实例具体的字段。示例：[{ "field_key": "priority", "field_value": { "value": "0" } }]',
    ),
  template_id: z
    .number()
    .optional()
    .describe("模板 ID，使用指定模板创建工作项"),
}).describe(
  "创建工作项实例，一次只能创建一条工作项实例，创建成功后，会获得对应的详情页url。",
);
export type CreateWorkItemParams = z.input<typeof CreateWorkItemParamsSchema>;

export const AbortWorkItemParamsSchema = WorkItemLocatorSchema.extend({
  is_aborted: z
    .boolean()
    .optional()
    .default(true)
    .describe("true=终止（默认），false=恢复已终止的工作项"),
  reason: z
    .string()
    .optional()
    .describe('终止或恢复的原因说明（如 "重复需求" "测试清理"）'),
}).describe(
  "终止或恢复工作项。默认终止（is_aborted=true），传 is_aborted=false 可恢复已终止的工作项。飞书项目不提供真正的删除 API，终止是最接近的操作。",
);
export type AbortWorkItemParams = z.input<typeof AbortWorkItemParamsSchema>;

export const GetWorkItemSchemaParamsSchema = z
  .object({
    /** 空间标识（project_key 或 simple_name） */
    project_key: z
      .string()
      .describe(
        '要查询的工作项类型所属的空间projectKey或simpleName，如 "openclaw"',
      ),
    /** 工作项类型标识（如 story / issue） */
    work_item_type_key: z
      .string()
      .describe(
        "要查询的工作项类型的系统标识或名称，如story、需求、issue、缺陷等",
      ),
  })
  .describe(
    "获取一个工作项类型具备的可用字段与角色信息。返回 fields（字段 key、名称、类型、选项列表）和 roles（角色 ID、名称）。用于在更新字段或角色前了解可用的字段和角色。",
  );
export type GetWorkItemSchemaParams = z.input<
  typeof GetWorkItemSchemaParamsSchema
>;

// ── 工作项操作结果 ──────────────────────────────────────

export const UpdateWorkItemFieldResultSchema = createLarkProjectResponseSchema(
  z.unknown(),
);
export type UpdateWorkItemFieldResult = z.infer<
  typeof UpdateWorkItemFieldResultSchema
>;

export const UpdateWorkItemRoleOwnersResultSchema =
  createLarkProjectResponseSchema(z.unknown());
export type UpdateWorkItemRoleOwnersResult = z.infer<
  typeof UpdateWorkItemRoleOwnersResultSchema
>;

export const GetBusinessesResultSchema = createLarkProjectResponseSchema(
  z.array(z.any()),
);
export type GetBusinessesResult = z.infer<typeof GetBusinessesResultSchema>;

export const GetWorkItemWorkflowResultSchema = createLarkProjectResponseSchema(
  z.any(),
);
export type GetWorkItemWorkflowResult = z.infer<
  typeof GetWorkItemWorkflowResultSchema
>;

export const ConfirmNodeResultSchema = createLarkProjectResponseSchema(
  z.unknown(),
);
export type ConfirmNodeResult = z.infer<typeof ConfirmNodeResultSchema>;

export const RollbackNodeResultSchema = createLarkProjectResponseSchema(
  z.unknown(),
);
export type RollbackNodeResult = z.infer<typeof RollbackNodeResultSchema>;

export const ChangeStateResultSchema = createLarkProjectResponseSchema(
  z.unknown(),
);
export type ChangeStateResult = z.infer<typeof ChangeStateResultSchema>;

export const CreateWorkItemResultSchema = createLarkProjectResponseSchema(
  z.union([z.number(), z.string()]),
);
export type CreateWorkItemResult = z.infer<typeof CreateWorkItemResultSchema>;

export const AbortWorkItemResultSchema = createLarkProjectResponseSchema(
  z.unknown(),
);
export type AbortWorkItemResult = z.infer<typeof AbortWorkItemResultSchema>;

export const GetWorkItemParamsSchema = z
  .object({
    /** 空间标识（project_key 或 simple_name） */
    project_key: z
      .string()
      .describe(
        '要查询的工作项类型所属的空间projectKey或simpleName，如 "openclaw"',
      ),
    /** 工作项 ID */
    work_item_id: z
      .union([z.number(), z.string()])
      .describe("要查询的工作项id或者名称，单值"),
    /** 工作项类型（可选，不传自动推断） */
    work_item_type_key: z
      .string()
      .optional()
      .describe("工作项类型（可选，不传自动推断）"),
  })
  .describe("获取一个工作项实例的概况，包括所有字段、当前节点、状态等信息。");
export type GetWorkItemParams = z.input<typeof GetWorkItemParamsSchema>;

export const GetWorkItemResultSchema =
  createLarkProjectResponseSchema(WorkItemSchema);
export type GetWorkItemResult = z.infer<typeof GetWorkItemResultSchema>;

/** 字段定义 */
export const FieldInfoSchema = z.object({
  field_key: z.string(),
  field_name: z.string(),
  field_type_key: z.string(),
  is_custom_field: z.boolean(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
});
export type FieldInfo = z.infer<typeof FieldInfoSchema>;

/** 角色定义 */
export const RoleInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_owner: z.boolean(),
});
export type RoleInfo = z.infer<typeof RoleInfoSchema>;

/** getWorkItemSchema 返回值 */
export const WorkItemSchemaSchema = z.object({
  fields: z.array(FieldInfoSchema),
  roles: z.array(RoleInfoSchema),
});
export type WorkItemSchema = z.infer<typeof WorkItemSchemaSchema>;

export const GetWorkItemSchemaResultSchema =
  createLarkProjectResponseSchema(WorkItemSchemaSchema);
export type GetWorkItemSchemaResult = z.infer<
  typeof GetWorkItemSchemaResultSchema
>;
