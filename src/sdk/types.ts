/**
 * Options for initializing a `LarkProject` client.
 */
export interface LarkProjectOptions {
  /** 飞书项目插件 ID，格式如 `MII_*` */
  pluginId: string;
  /** 飞书项目插件密钥 */
  pluginSecret: string;
  /** 用户标识，格式如 `ou_*` 或 `user_*` */
  userKey: string;
}

/**
 * 工作项定位参数
 */
export interface WorkItemLocator {
  url?: string;
  project_key?: string;
  work_item_type?: string;
  work_item_type_key?: string;
  work_item_id?: string;
}

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

export interface LarkProjectResponse<T = unknown> {
  err_code: number;
  err_msg: string;
  data: T;
  [key: string]: unknown;
}

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
