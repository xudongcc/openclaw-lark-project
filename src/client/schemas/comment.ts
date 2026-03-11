import { z } from "zod";
import {
  createLarkProjectResponseSchema,
  WorkItemLocatorSchema,
  msToDate,
} from "./common";

// ── 评论实体类型 ─────────────────────────────────────────

/** 评论中的用户基本信息 */
export const CommentUserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type CommentUser = z.infer<typeof CommentUserSchema>;

/** 评论 */
export const CommentSchema = z.object({
  /** 评论 ID（字符串，BigInt） */
  id: z.string(),
  /** 评论创建时间（毫秒时间戳 → Date） */
  created_at: msToDate,
  /** 评论发起人 */
  author: CommentUserSchema,
  /** 评论正文 */
  content: z.string(),
  /** 是否为当前用户发送的 */
  is_mine: z.boolean(),
  /** 当前用户是否可以更新此评论 */
  can_update: z.boolean(),
  /** 当前用户是否可以删除此评论 */
  can_delete: z.boolean(),
  /** 解析出的 @mentions 用户列表 */
  mentions: z.array(CommentUserSchema).optional(),
});

export type Comment = z.infer<typeof CommentSchema>;

// ── 评论操作参数 ─────────────────────────────────────────

export const CreateCommentParamsSchema = WorkItemLocatorSchema.extend({
  content: z
    .string()
    .min(1)
    .describe("评论正文（纯文本，不支持 markdown 或富文本）"),
}).describe(
  "在工作项下添加一条纯文本评论。返回新评论 ID（data 字段）。适用于自动化记录进展、留言通知等场景。",
);

export type CreateCommentParams = z.infer<typeof CreateCommentParamsSchema>;

export const GetCommentsParamsSchema = WorkItemLocatorSchema.extend(
  {},
).describe(
  "获取工作项的所有评论列表。返回评论数组，每条包含 id、content、creator、created_at 等字段。可用于在删除前查找 comment_id。",
);

export type GetCommentsParams = z.infer<typeof GetCommentsParamsSchema>;

export const UpdateCommentParamsSchema = WorkItemLocatorSchema.extend({
  comment_id: z.string().min(1).describe("要更新的评论 ID"),
  content: z.string().min(1).describe("评论的新正文内容（纯文本）"),
}).describe("更新工作项下的指定评论。仅评论创建人有权更新。");

export type UpdateCommentParams = z.infer<typeof UpdateCommentParamsSchema>;

export const DeleteCommentParamsSchema = WorkItemLocatorSchema.extend({
  comment_id: z
    .string()
    .min(1)
    .describe("要删除的评论 ID，通过 lark_project_comment_list 返回的评论列表中获取"),
}).describe(
  "删除工作项下的指定评论。仅评论创建人有权删除。comment_id 可通过 lark_project_comment_list 获取。",
);

export type DeleteCommentParams = z.infer<typeof DeleteCommentParamsSchema>;

// ── 评论操作结果 ─────────────────────────────────────────

export const CreateCommentResultSchema = createLarkProjectResponseSchema(
  z.string(),
);
/** 创建评论结果，data 为新评论 ID（字符串） */
export type CreateCommentResult = z.infer<typeof CreateCommentResultSchema>;

export const GetCommentsResultSchema = createLarkProjectResponseSchema(
  z.array(CommentSchema),
);
/** 评论列表结果 */
export type GetCommentsResult = z.infer<typeof GetCommentsResultSchema>;

export const UpdateCommentResultSchema = createLarkProjectResponseSchema(
  z.record(z.string(), z.never()),
);
/** 更新评论结果，data 为空对象 */
export type UpdateCommentResult = z.infer<typeof UpdateCommentResultSchema>;

export const DeleteCommentResultSchema = createLarkProjectResponseSchema(
  z.record(z.string(), z.never()),
);
/** 删除评论结果，data 为空对象 */
export type DeleteCommentResult = z.infer<typeof DeleteCommentResultSchema>;
