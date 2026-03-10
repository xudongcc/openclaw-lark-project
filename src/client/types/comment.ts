import type { LarkProjectResponse } from "./common";
import type { WorkItemLocator } from "./common";

// ── 评论实体类型 ─────────────────────────────────────────

/** 评论中的用户基本信息 */
export interface CommentUser {
  id: string;
  name: string;
}

/** 评论 */
export interface Comment {
  /** 评论 ID（字符串，BigInt） */
  id: string;
  /** 评论创建时间（ISO 格式） */
  created_at: Date;
  /** 评论发起人 */
  author: CommentUser;
  /** 评论人名称 */
  user_name: string;
  /** 评论内容 */
  content: string;
  /** 解析出的 @mentions 用户列表 */
  mentions?: CommentUser[];
}

// ── 评论操作参数 ─────────────────────────────────────────

export interface CreateWorkItemCommentParams extends WorkItemLocator {
  content: string;
}

export interface ListWorkItemCommentsParams extends WorkItemLocator {}

export interface DeleteWorkItemCommentParams extends WorkItemLocator {
  comment_id: string;
}

// ── 评论操作结果 ─────────────────────────────────────────

/** 创建评论结果，data 为新评论 ID（字符串） */
export type CreateWorkItemCommentResult = LarkProjectResponse<string>;
/** 评论列表结果 */
export type ListWorkItemCommentsResult = LarkProjectResponse<Comment[]>;
/** 删除评论结果，data 为空对象 */
export type DeleteWorkItemCommentResult = LarkProjectResponse<Record<string, never>>;
