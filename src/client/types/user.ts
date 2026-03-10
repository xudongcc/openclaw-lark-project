/** 用户详情 */
export interface UserDetail {
  /** 用户在飞书项目的唯一标识 (原 user_key) */
  id: string;
  /** 用户名称 */
  name: string;
  /** 用户邮箱 */
  email: string;
  /** 飞书开放平台 union_id */
  out_id: string;
  /** 用户状态：initialized/resigned/frozen/activated */
  status: string;
}

export interface GetUsersByIdsParams {
  /** 要查询的 id 列表（最多 100 个） */
  ids: string[];
}

/** 模糊搜索用户的请求参数 */
export interface SearchUsersParams {
  /** 搜索关键词（用户名称） */
  query: string;
  /** 空间 ID（可选，用于判断所属租户） */
  project_key?: string;
}
