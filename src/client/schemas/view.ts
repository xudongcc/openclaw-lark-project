import { z } from "zod";
import {
  type LarkProjectResponse,
  PaginationSchema,
  createLarkProjectResponseSchema,
  msToDate,
} from "./common";
import type { Pagination } from "./common";
import { WorkItemSchema } from "./work-item";
import type { WorkItem } from "./work-item";

// ── 视图查询参数 ────────────────────────────────────────

export const GetViewDetailParamsSchema = z
  .object({
    /** 空间标识（project_key 或 simple_name） */
    project_key: z
      .string()
      .describe(
        '要查询的工作项类型所属的空间projectKey或simpleName，如 "openclaw"',
      ),
    /** 视图 ID */
    view_id: z.string().describe("传入要查询的视图id，单值"),
    /** 页码（从 1 开始，默认 1） */
    page_num: z
      .number()
      .int()
      .min(1)
      .optional()
      .default(1)
      .describe("分页查询页数起点"),
    /** 每页条数（最大 200，默认 200） */
    page_size: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .default(200)
      .describe("每页条数，最大 200"),
  })
  .describe(
    "获取指定视图下的工作项列表及详情。返回视图名称、工作项 ID 列表和每个工作项的完整详情。",
  );

export type GetViewDetailParams = z.input<typeof GetViewDetailParamsSchema>;

// ── 视图详情 ────────────────────────────────────────────

/** fix_view API 返回的视图详情 */
export const ViewDetailSchema = z.object({
  /** 视图 ID */
  view_id: z.string(),
  /** 视图名称 */
  name: z.string(),
  /** 创建人 id */
  created_by: z.string(),
  /** 创建时间戳（毫秒） */
  created_at: msToDate,
  /** 最后修改人 id */
  modified_by: z.string(),
  /** 是否可编辑 */
  editable: z.boolean(),
  /** 视图中的工作项 ID 列表 */
  work_item_id_list: z.array(z.union([z.number(), z.string()])),
  /** 工作项完整详情（通过 filter API 自动查询） */
  work_items: z.array(z.lazy(() => WorkItemSchema)).optional(),
});

export type ViewDetail = z.infer<typeof ViewDetailSchema>;

// ── 视图查询结果 ────────────────────────────────────────

export const GetViewDetailResultSchema = createLarkProjectResponseSchema(
  ViewDetailSchema,
).extend({
  pagination: PaginationSchema,
});

export type GetViewDetailResult = z.infer<typeof GetViewDetailResultSchema>;
