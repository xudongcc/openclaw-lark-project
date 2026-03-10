/** 用户名称多语言 */
export interface UserName {
  zh_cn: string;
  en_us: string;
  default: string;
}

/** 用户详情 */
export interface UserDetail {
  /** 用户在飞书项目的 user_key */
  user_key: string;
  /** 同 user_key（兼容旧字段） */
  username: string;
  /** 用户邮箱 */
  email: string;
  /** 用户头像链接 */
  avatar_url: string;
  /** 中文名 */
  name_cn: string;
  /** 英文名 */
  name_en: string;
  /** 用户名称（多语言） */
  name: UserName;
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
