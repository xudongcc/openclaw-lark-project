// ── searchByMql 响应类型 ────────────────────────────────

/** MOQL 查询字段值 */
export interface MoqlFieldValue {
  long_value?: number;
  string_value?: string;
  [key: string]: unknown;
}

/** MOQL 查询参数 */
export interface SearchByMqlParams {
  /** 空间标识 */
  project_key: string;
  /** MOQL 查询语句 */
  moql?: string;
  /** sessionID，主要用于分页查询 */
  session_id?: string;
  /** 分页信息列表 */
  group_pagination_list?: Array<{
    group_id?: string;
    page_num?: number;
  }>;
  /** 分页页码（从 1 开始，历史遗留简化参数） */
  page_num?: number;
}

/** MOQL 查询返回的字段 */
export interface MoqlField {
  /** 字段标识 */
  key: string;
  /** 字段名称（中文） */
  name: string;
  /** 值类型标识（如 "long_value" / "string_value"） */
  value_type: string;
  /** 字段值 */
  value: MoqlFieldValue;
}

/** MOQL 查询返回的工作项行 */
export interface MoqlRow {
  moql_field_list: MoqlField[];
}

/** MOQL 分组信息 */
export interface MoqlGroupInfo {
  group_name: string;
  group_id: string;
}

/** MOQL 分组统计 */
export interface MoqlGroup {
  group_infos: MoqlGroupInfo[];
  count: number;
}

/** searchByMql 返回结果 */
export interface SearchByMqlResult {
  /** 分组统计列表 */
  list: MoqlGroup[];
  /** 会话 ID（用于分页查询） */
  session_id: string;
  /** 查询数据，key 为 group_id，value 为该分组下的行 */
  data: Record<string, MoqlRow[]>;
  search_status_info: unknown;
  extra_info: unknown;
}

// ── getSchedule 响应类型 ───────────────────────────────

/** 排期用户信息 */
export interface ScheduleUserInfo {
  /** 用户名称 */
  name: string;
  /** 用户标识 */
  userKey: string;
  /** 用户邮箱 */
  email: string;
}

/** 排期工作项信息 */
export interface ScheduleWorkItemInfo {
  /** 工作项名称 */
  name: string;
  /** 工作项 ID */
  id: number;
  /** 工作项状态（如 "started"） */
  work_item_status: string;
}

/** 排期任务状态 */
export interface ScheduleTaskState {
  /** 是否排期时间不一致 */
  different_schedule: boolean;
  /** 是否已通过 */
  passed: boolean;
  /** 是否已到达 */
  reached: boolean;
  /** 状态标识 */
  state_id: string;
  /** 状态名称（如 "进行中"） */
  state_name: string;
}

/** 排期时间信息 */
export interface ScheduleTime {
  /** 持续天数 */
  duration: number;
  /** 结束时间（格式 "YYYY-MM-DD HH:mm:ss"） */
  end: string;
  /** 开始时间（格式 "YYYY-MM-DD HH:mm:ss"） */
  start: string;
}

/** 排期任务 */
export interface ScheduleTask {
  /** 工作项信息 */
  work_item_info: ScheduleWorkItemInfo;
  /** 任务状态 */
  state: ScheduleTaskState;
  /** 子任务列表 */
  subtasks: unknown;
  /** 排期时间 */
  time: ScheduleTime;
}

/** 用户工作量明细 */
export interface UserWorkload {
  /** 用户信息 */
  user_info: ScheduleUserInfo;
  /** 排期任务列表 */
  tasks: ScheduleTask[];
  /** 总估分 */
  total_score: number;
  /** 已展示的工作项数 */
  total_showed_work_item: number;
  /** 未排期任务数 */
  total_unscheduled_task: number;
  /** 隐藏的未排期任务数 */
  unscheduled_tasks_hidden_count: number;
}

/** getSchedule 返回结果 */
export interface GetScheduleResult {
  /** 用户工作量列表 */
  user_workload_list: UserWorkload[];
  /** 总用户数 */
  total: number;
}
