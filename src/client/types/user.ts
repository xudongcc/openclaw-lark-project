/** 用户详情 */
export interface UserDetail {
  /** 用户在飞书项目的 user_key */
  user_key: string;
  /** 用户名称 */
  user_name: string;
  /** 用户邮箱 */
  email: string;
  /** 飞书开放平台 union_id */
  out_id: string;
  /** 用户状态：initialized/resigned/frozen/activated */
  status: string;
}

/** 批量查询用户详情的请求参数 */
export interface QueryUsersParams {
  /** 要查询的 user_key 列表（最多 100 个） */
  user_keys: string[];
}
