import { z } from "zod";

// ── searchByMql 参数 Schema ───────────────────────────────

export const SearchByMqlParamsSchema = z
  .object({
    project_key: z
      .string()
      .describe("要查询的工作项类型所属的空间projectKey或simpleName或空间名"),
    session_id: z
      .string()
      .describe(
        "sessionID，传sessionID时不会解析MOQL，直接根据sessionID查询之前的数据。该信息会在exec_moql接口返回体里返回。主要用于分页查询。",
      )
      .optional(),
    group_pagination_list: z
      .array(
        z.object({
          group_id: z
            .string()
            .describe("分组ID（从上一次接口返回中获取`group_id`）")
            .optional(),
          page_num: z.number().describe("页码，从1开始，每页50条"),
        }),
      )
      .describe(
        "分页信息。首次查询时可不传（默认返回第一页，最多50条数据）。后续分页可传入该字段+session_id。",
      )
      .optional(),
    moql: z
      .string()
      .describe(
        "要执行的moql语句。\n" +
          "语法规范如下：\n" +
          "- 支持现有的Mysql语法。现有的Mysql函数。\n" +
          "- 提供数组判断方法，通过返回bool类型来表示是否满足条件。包含两个入参：array_col是array类型的列；predicate是lambda_expr类型的表达式，表示判断条件。举例：all_match(ary_col, x -> x > 10)，判断ary_col中是否每个元素都大于10。\n" +
          "  - all_match(array_col, predicate): array中是否所有element都满足特定条件\n" +
          "  - any_match(array_col, predicate): array中是否有一个element满足特定条件\n" +
          "  - none_match(array_col, predicate): array中是否所有element都不满足特定条件\n" +
          "  - array_contains(array_col, element): array中是否包含element\n" +
          "- 提供数组数据处理方法：\n" +
          "  - array_cardinality(array_col): 返回一个array的元素个数（bigint）\n" +
          "  - array_filter(array_col, predicate): 根据lambda_func对array进行过滤，返回过滤后的新数组（array）\n" +
          "- 提供团队与人员方法：\n" +
          "  - current_login_user(): 当前登录用户，返回userkey\n" +
          "  - team(include_manager, team_name): 表示名字为team_name的团队。入参：include_manager(bool)表示是否包含管理者；team_name(varchar)表示团队名称。返回array(varchar)类型。举例：team(true, '后端开发团队')\n" +
          "  - participate_roles(): 返回array(varchar)，表示所有参与角色的rolekey\n" +
          "  - all_participate_persons(): 返回array(varchar)，表示所有参与人的userkey\n" +
          "- 提供时间判断方法，返回bool类型来表示是否满足条件：\n" +
          "  - 入参：col_name(date或datetime类型)；date_para可选值：today/tomorrow/yesterday/current_week/next_week/last_week/current_month/next_month/last_month/future/past；days(varchar，可选，在date_para等于future、past、today时表示偏移天数)\n" +
          "  - RELATIVE_DATETIME_EQ(col_name, 'date_para', ['days']): 等于某一特定相对时间\n" +
          "  - RELATIVE_DATETIME_GT(col_name, 'date_para', ['days']): 大于某一特定相对时间\n" +
          "  - RELATIVE_DATETIME_GE(col_name, 'date_para', ['days']): 大于等于某一特定相对时间\n" +
          "  - RELATIVE_DATETIME_LT(col_name, 'date_para', ['days']): 小于某一特定相对时间\n" +
          "  - RELATIVE_DATETIME_LE(col_name, 'date_para', ['days']): 小于等于某一特定相对时间\n" +
          "  - RELATIVE_DATETIME_BETWEEN(col_name, 'date_para', ['days']): 属于某一特定相对时间\n" +
          "  - 举例：RELATIVE_DATETIME_EQ(`创建时间`, 'today')表示创建时间等于今天；RELATIVE_DATETIME_EQ(`创建时间`, 'today', '3d')表示创建时间等于今天后3天\n" +
          "MOQL示例：\n" +
          "1. select `工作项id` from `测试空间`.`需求` where `是否冻结` = 0; 查询所有未冻结的需求工作项ID\n" +
          "2. select `工作项id` from `测试空间`.`需求` where `名称` like '%a%'; 查询所有名称中包含字母a的需求工作项ID\n" +
          "3. select `工作项id` from `测试空间`.`需求` where any_match(`当前负责人`, x -> x in (current_login_user(), '小李')); 当前负责人存在选项等于小李\n" +
          "4. select `工作项id` from `测试空间`.`需求` where any_match(`当前负责人`, usr -> usr in team(include_manager, '团队1') OR usr in ('小王')); 当前负责人在团队1里或者等于小王\n" +
          "5. SELECT `工作项id` FROM `测试空间`.`需求` WHERE `__开发周期_开始时间` > '2025-01-01' AND `__开发周期_结束时间` < '2025-01-31'; 当要查询的属性为schedule类型时，请以带__A_B的特殊格式请求\n" +
          "6. 对于角色的查询，需要以带__前缀的特殊格式请求，比如查询RD：SELECT `工作项id` FROM `测试空间`.`需求` WHERE array_contains(__RD, '张三');",
      )
      .optional(),
    page_num: z
      .number()
      .describe(
        "页码，从1开始。此参数为快捷分页参数，也可使用 group_pagination_list 实现更复杂的分页",
      )
      .optional(),
  })
  .describe("MOQL查询的参数");

export type SearchByMqlParams = z.input<typeof SearchByMqlParamsSchema>;

// ── getSchedule 参数 Schema ──────────────────────────────

export const GetScheduleParamsSchema = z
  .object({
    project_key: z
      .string()
      .describe(
        "传入要查询的工作项所属空间标识。支持直接输入空间的projectKey、空间名称或simple_name",
      ),
    start_time: z
      .string()
      .describe(
        "传入查询排期的时间范围（最大不超过3个月）开始时间，请严格按照以下格式输入：2006-01-01",
      ),
    end_time: z
      .string()
      .describe(
        "传入查询排期的时间范围结束时间（最大不超过3个月），请严格按照以下格式输入：2006-01-01",
      ),
    user_keys: z
      .array(z.string())
      .describe(
        "传入要查询排期的用户的唯一标识，支持输入名称、邮箱或 user_key，支持传入多个，最多支持 20 个",
      ),
    work_item_type_keys: z
      .array(z.string())
      .describe(
        "要查询的个人任务的唯一标识，支持输入名称、系统标识或work_item_type_key，如story、需求、issue、缺陷、子任务、sub_task等。查询所有工作项类型时可以传入_all",
      )
      .optional(),
  })
  .describe("日程排期查询的参数");

export type GetScheduleParams = z.input<typeof GetScheduleParamsSchema>;

// ── searchByMql 响应类型 ────────────────────────────────

/** MOQL 查询字段值 */
export interface MoqlFieldValue {
  long_value?: number;
  string_value?: string;
  [key: string]: unknown;
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
