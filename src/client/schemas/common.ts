import { z } from "zod";
import { dateFormat } from "../utils/date-format.js";

/**
 * Options for initializing a `LarkProjectClient` client.
 */
export const LarkProjectClientOptionsSchema = z.object({
  /** 飞书项目插件 ID，格式如 `MII_*` */
  pluginId: z.string(),
  /** 飞书项目插件密钥 */
  pluginSecret: z.string(),
  /** 用户标识，格式如 `7136000000000000676` */
  userKey: z.string(),
});

export type LarkProjectClientOptions = z.infer<
  typeof LarkProjectClientOptionsSchema
>;

/**
 * 工作项定位参数
 */
export const WorkItemLocatorSchema = z.object({
  url: z
    .string()
    .url()
    .describe(
      "工作项详情页 URL，例如 https://project.feishu.cn/<project_key>/<type>/detail/<id>",
    )
    .optional(),
  project_key: z
    .string()
    .describe("项目空间唯一标识 (例如: openclaw)")
    .optional(),
  work_item_type: z.string().describe("如 story / issue / bug").optional(),
  work_item_type_key: z.string().describe("work_item_type 的别名").optional(),
  work_item_id: z
    .union([z.string(), z.number()])
    .describe("工作项数字 ID")
    .optional(),
});

export type WorkItemLocator = z.infer<typeof WorkItemLocatorSchema>;

export function createLarkProjectResponseSchema<T>(dataSchema: z.ZodType<T>) {
  return z.object({
    err_code: z.number(),
    err_msg: z.string(),
    data: dataSchema,
  });
}

// 保留原有的泛型类型，基于 Schema 的 infer 需要传递参数，但由于我们需要对外提供简单的泛型支持，所以手动定义类型
export interface LarkProjectResponse<T = unknown> {
  err_code: number;
  err_msg: string;
  data: T;
  [key: string]: unknown;
}

export const PaginationSchema = z.object({
  /** 总数 */
  total: z.number(),
  /** 当前页码 */
  page_num: z.number(),
  /** 每页条数 */
  page_size: z.number(),
});

export type Pagination = z.infer<typeof PaginationSchema>;

/** 毫秒时间戳 → ISO 8601 带时区字符串，0 或 falsy → null */
export const msToDate = z
  .number()
  .transform((v) => (v > 0 ? dateFormat(new Date(v)) : null));
