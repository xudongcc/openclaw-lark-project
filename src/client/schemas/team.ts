import { z } from "zod";
import { UserDetailSchema } from "./user";
import type { UserDetail } from "./user";

// ── 团队查询参数 ──────────────────────────────────────

/**
 * 查询空间下团队人员的请求参数。
 */
export const GetTeamsParamsSchema = z
  .object({
    /** 空间标识（project_key 或 simple_name） */
    project_key: z
      .string()
      .describe('空间唯一标识（project_key），如 "openclaw"'),
    /** 页码（从 0 开始） */
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("分页偏移量，从 0 开始"),
    /** 每页条数（最大 300，默认 300） */
    limit: z
      .number()
      .int()
      .min(1)
      .max(300)
      .optional()
      .default(300)
      .describe("单页条数，范围 1~300，默认 300"),
    /** 是否包含用户详情（默认 false） */
    include_user_detail: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "是否获取成员详细信息（设为 true 会在 user_details 中返回 name、email 等）",
      ),
  })
  .describe(
    "获取指定空间下的团队人员列表。返回团队 ID、团队名称、人员列表（user_keys）、管理员列表（administrators）、成员列表（members）。设置 include_user_detail=true 时自动查询用户详情，返回 user_details 映射（含 name_cn、email、avatar_url、status 等）。",
  );

export type GetTeamsParams = z.input<typeof GetTeamsParamsSchema>;

// ── 团队信息 ──────────────────────────────────────

/** 团队信息（含用户详情） */
export const TeamWithDetailsSchema = z.object({
  /** 团队 ID */
  team_id: z.string(),
  /** 团队名称 */
  team_name: z.string(),
  /** 团队下的人员 user_key 列表 */
  user_keys: z.array(z.string()),
  /** 团队下的管理员 user_key 列表 */
  administrators: z.array(z.string()),
  /** 团队下的成员 user_key 列表 */
  members: z.array(z.string()),
  /** 人员详情映射（user_key → 用户信息） */
  user_details: z.record(z.string(), UserDetailSchema),
});

export type TeamWithDetails = z.infer<typeof TeamWithDetailsSchema>;

/** 查询空间下团队人员的响应 */
export const GetTeamsResultSchema = z.object({
  data: z.array(TeamWithDetailsSchema),
  /** 是否还有更多团队 */
  has_more: z.boolean(),
  err_code: z.number(),
  err_msg: z.string(),
  err: z.record(z.string(), z.unknown()),
});

export type GetTeamsResult = z.infer<typeof GetTeamsResultSchema>;
