import type { WorkItemLocator, LarkProjectResponse } from "./common";

// ── 工作项实体类型 ──────────────────────────────────────

/** 工作项字段值对 */
export interface WorkItemField {
  /** 字段唯一标识 */
  field_key: string;
  /** 字段值，类型取决于 field_type_key */
  field_value: unknown;
  /** 字段类型标识（如 select / date / bool / multi_text 等） */
  field_type_key: string;
  /** 字段别名 */
  field_alias: string;
  /** 帮助描述 */
  help_description: string;
}

/** 工作流节点 */
export interface WorkItemNode {
  /** 节点 ID（如 "start" / "doing" / "end"） */
  id: string;
  /** 节点名称 */
  name: string;
  /** 负责人 user_key 列表 */
  owners: string[];
  /** 是否为里程碑节点 */
  milestone: boolean;
}

/** 工作项状态变更记录 */
export interface WorkItemStatusRecord {
  state_key: string;
  is_archived_state: boolean;
  is_init_state: boolean;
  updated_at: number;
  updated_by: string;
}

/** 工作项当前状态 */
export interface WorkItemStatus {
  state_key: string;
  is_archived_state: boolean;
  is_init_state: boolean;
  updated_at: number;
  updated_by: string;
  /** 状态变更历史（filter API 可能返回） */
  history?: WorkItemStatusRecord[];
}

/** 节点停留时间 */
export interface StateTime {
  state_key: string;
  /** 节点名称 */
  name: string;
  /** 进入时间戳（毫秒） */
  start_time: number;
  /** 离开时间戳（毫秒），0 表示仍在该节点 */
  end_time: number;
}

/** 工作项完整详情（filter API 返回） */
export interface WorkItem {
  /** 工作项 ID */
  id: number;
  /** 工作项名称 */
  name: string;
  /** 工作项类型标识（如 story / issue） */
  work_item_type_key: string;
  /** 空间 project_key */
  project_key: string;
  /** 空间域名（simple_name） */
  simple_name: string;
  /** 工作流模式（如 "Node" / "State"） */
  pattern: string;
  /** 子阶段（如 "started"） */
  sub_stage: string;
  /** 模板 ID */
  template_id: number;
  /** 模板类型标识 */
  template_type: string;
  /** 创建人 user_key */
  created_by: string;
  /** 创建时间戳（毫秒） */
  created_at: number;
  /** 最后修改人 user_key */
  updated_by: string;
  /** 最后修改时间戳（毫秒） */
  updated_at: number;
  /** 删除人 user_key，空字符串表示未删除 */
  deleted_by: string;
  /** 删除时间戳（毫秒），0 表示未删除 */
  deleted_at: number;
  /** 当前所处节点列表 */
  current_nodes: WorkItemNode[];
  /** 当前工作项状态 */
  work_item_status: WorkItemStatus;
  /** 各节点停留时间 */
  state_times: StateTime[];
  /** 工作项字段列表 */
  fields: WorkItemField[];
}

// ── 工作项操作参数 ──────────────────────────────────────

export interface CreateWorkItemCommentParams extends WorkItemLocator {
  content: string;
}

export interface ListWorkItemCommentsParams extends WorkItemLocator {}

export interface DeleteWorkItemCommentParams extends WorkItemLocator {
  comment_id: string;
}

export interface UpdateWorkItemFieldParams extends WorkItemLocator {
  update_fields: { field_key: string; field_value: unknown }[];
}

export interface UpdateWorkItemRoleOwnersParams extends WorkItemLocator {
  role_owners: { role: string; owners: string[] }[];
}

export interface ListBusinessesParams {
  project_key: string;
}

export interface GetWorkItemWorkflowParams extends WorkItemLocator {}

export interface ConfirmNodeParams extends WorkItemLocator {
  node_id: string;
  node_owners?: string[];
  node_schedule?: Record<string, unknown>;
  fields?: { field_key: string; field_value: unknown }[];
  role_assignee?: { role: string; owners: string[] }[];
}

export interface RollbackNodeParams extends WorkItemLocator {
  node_id: string;
  rollback_reason: string;
}

export interface ChangeStateParams extends WorkItemLocator {
  transition_id: string;
  fields?: { field_key: string; field_value: unknown }[];
  role_owners?: { role: string; owners: string[] }[];
}

export interface CreateWorkItemParams extends WorkItemLocator {
  name?: string;
  field_value_pairs?: {
    field_key: string;
    field_value: unknown;
    field_type_key?: string;
  }[];
  template_id?: number;
}

export interface AbortWorkItemParams extends WorkItemLocator {
  is_aborted?: boolean;
  reason?: string;
}

export interface GetWorkItemSchemaParams {
  /** 空间标识（project_key 或 simple_name） */
  project_key: string;
  /** 工作项类型标识（如 story / issue） */
  work_item_type_key: string;
}

// ── 工作项操作结果 ──────────────────────────────────────

export type CreateWorkItemCommentResult = LarkProjectResponse<number | string>;
export type ListWorkItemCommentsResult = LarkProjectResponse<any[]>;
export type DeleteWorkItemCommentResult = LarkProjectResponse<unknown>;
export type UpdateWorkItemFieldResult = LarkProjectResponse<unknown>;
export type UpdateWorkItemRoleOwnersResult = LarkProjectResponse<unknown>;
export type ListBusinessesResult = LarkProjectResponse<any[]>;
export type GetWorkItemWorkflowResult = LarkProjectResponse<any>;
export type ConfirmNodeResult = LarkProjectResponse<unknown>;
export type RollbackNodeResult = LarkProjectResponse<unknown>;
export type ChangeStateResult = LarkProjectResponse<unknown>;
export type CreateWorkItemResult = LarkProjectResponse<number | string>;
export type AbortWorkItemResult = LarkProjectResponse<unknown>;

export interface GetWorkItemParams {
  /** 空间标识（project_key 或 simple_name） */
  project_key: string;
  /** 工作项 ID */
  work_item_id: number | string;
  /** 工作项类型（可选，不传自动推断） */
  work_item_type_key?: string;
}

export type GetWorkItemResult = LarkProjectResponse<WorkItem>;

/** 字段定义 */
export interface FieldInfo {
  field_key: string;
  field_name: string;
  field_type_key: string;
  is_custom_field: boolean;
  options?: { label: string; value: string }[];
}

/** 角色定义 */
export interface RoleInfo {
  id: string;
  name: string;
  is_owner: boolean;
}

/** getWorkItemSchema 返回值 */
export interface WorkItemSchema {
  fields: FieldInfo[];
  roles: RoleInfo[];
}

export type GetWorkItemSchemaResult = LarkProjectResponse<WorkItemSchema>;
