/**
 * Options for initializing a `LarkProjectClient` client.
 */
export interface LarkProjectClientOptions {
  /** 飞书项目插件 ID，格式如 `MII_*` */
  pluginId: string;
  /** 飞书项目插件密钥 */
  pluginSecret: string;
  /** 用户标识，格式如 `7136000000000000676` */
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

export interface LarkProjectResponse<T = unknown> {
  err_code: number;
  err_msg: string;
  data: T;
  [key: string]: unknown;
}

export interface Pagination {
  /** 总数 */
  total: number;
  /** 当前页码 */
  page_num: number;
  /** 每页条数 */
  page_size: number;
}
