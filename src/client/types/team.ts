import type { UserDetail } from "./user";

// ── 团队查询参数 ──────────────────────────────────────

/**
 * 查询空间下团队人员的请求参数。
 */
export interface ListTeamsParams {
  /** 空间标识（project_key 或 simple_name） */
  project_key: string;
  /** 页码（从 0 开始） */
  offset?: number;
  /** 每页条数（最大 300，默认 300） */
  limit?: number;
  /** 是否包含用户详情（默认 false） */
  include_user_detail?: boolean;
}

// ── 团队信息 ──────────────────────────────────────

/** 团队信息（含用户详情） */
export interface TeamWithDetails {
  /** 团队 ID */
  team_id: number;
  /** 团队名称 */
  team_name: string;
  /** 团队下的人员 user_id 列表 */
  user_ids: string[];
  /** 团队下的管理员 user_id 列表 */
  administrators: string[];
  /** 团队下的成员 user_id 列表 */
  members: string[];
  /** 人员详情映射（user_id → 用户信息） */
  user_details: Record<string, UserDetail>;
}

/** 查询空间下团队人员的响应 */
export interface ListTeamsResult {
  data: TeamWithDetails[];
  /** 是否还有更多团队 */
  has_more: boolean;
  err_code: number;
  err_msg: string;
  err: Record<string, unknown>;
}
