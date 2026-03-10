import { z } from "zod";

/** 用户详情 */
export const UserDetailSchema = z.object({
  /** 用户在飞书项目的唯一标识 (原 user_key) */
  id: z.string(),
  /** 用户名称 */
  name: z.string(),
  /** 用户邮箱 */
  email: z.string(),
  /** 飞书开放平台 union_id */
  out_id: z.string(),
  /** 用户状态：initialized/resigned/frozen/activated */
  status: z.enum(["initialized", "resigned", "frozen", "activated"]),
});

export type UserDetail = z.infer<typeof UserDetailSchema>;

export const GetUsersByIdsParamsSchema = z
  .object({
    /** 要查询的 id 列表（最多 100 个） */
    ids: z
      .array(z.string())
      .min(1)
      .max(100)
      .describe(
        "要批量查询的用户 id 列表（单次最多 100 个），如 ['7136000000000000676']",
      ),
  })
  .describe(
    "批量查询用户详情。根据 id 列表获取用户的详细信息。每次最多查询 100 个用户。",
  );

export type GetUsersByIdsParams = z.infer<typeof GetUsersByIdsParamsSchema>;

/** 获取单个用户的请求参数 */
export const GetUserParamsSchema = z
  .object({
    /** 用户名称、邮箱或 id */
    query: z.string().min(1).describe("ID、名称或邮箱"),
    /** 空间 ID（可选，用于判断所属租户） */
    project_key: z
      .string()
      .optional()
      .describe('空间唯一标识（可选，用于限定租户范围），如 "openclaw"'),
  })
  .describe("通过ID、名称或邮箱获取单个用户详情。");

export type GetUserParams = z.infer<typeof GetUserParamsSchema>;

/** 模糊搜索用户的请求参数 */
export const SearchUsersParamsSchema = z
  .object({
    /** 搜索关键词（用户名称） */
    query: z
      .string()
      .min(1)
      .describe("支持名称（包含中英文）、邮箱或 id 精确或模糊匹配"),
    /** 空间 ID（可选，用于判断所属租户） */
    project_key: z
      .string()
      .optional()
      .describe('空间唯一标识（可选，用于限定租户范围），如 "openclaw"'),
  })
  .describe("模糊搜索用户，返回匹配的用户列表。");

export type SearchUsersParams = z.infer<typeof SearchUsersParamsSchema>;
