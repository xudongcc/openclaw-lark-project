import type { LarkProjectResponse, Pagination } from "./common";
import type { WorkItem } from "./work-item";

// ── 视图查询参数 ────────────────────────────────────────

export interface GetViewDetailParams {
  project_key: string;
  view_id: string;
  page_num?: number;
  page_size?: number;
}

// ── 视图详情 ────────────────────────────────────────────

/** fix_view API 返回的视图详情 */
export interface ViewDetail {
  /** 视图 ID */
  view_id: string;
  /** 视图名称 */
  name: string;
  /** 创建人 user_key */
  created_by: string;
  /** 创建时间戳（毫秒） */
  created_at: number;
  /** 最后修改人 user_key */
  modified_by: string;
  /** 是否可编辑 */
  editable: boolean;
  /** 视图中的工作项 ID 列表 */
  work_item_id_list: (number | string)[];
  /** 工作项完整详情（通过 filter API 自动查询） */
  work_items?: WorkItem[];
}

// ── 视图查询结果 ────────────────────────────────────────

export type GetViewDetailResult = LarkProjectResponse<ViewDetail> & {
  pagination: Pagination;
};
