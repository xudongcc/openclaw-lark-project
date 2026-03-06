import { describe, it, expect, beforeAll } from "vitest";
import { LarkProject } from "./sdk";

const PLUGIN_ID = process.env.LARK_PLUGIN_ID!;
const PLUGIN_SECRET = process.env.LARK_PLUGIN_SECRET!;
const PROJECT_KEY = process.env.LARK_PROJECT_KEY!;
const USER_KEY = process.env.LARK_USER_KEY!;

const skip = !PLUGIN_ID || !PLUGIN_SECRET || !PROJECT_KEY || !USER_KEY;

describe.skipIf(skip)("LarkProject", () => {
  let client: LarkProject;
  const WORK_ITEM_TYPE = process.env.LARK_WORK_ITEM_TYPE || "story";
  let workItemId: string;

  beforeAll(async () => {
    client = new LarkProject({
      pluginId: PLUGIN_ID,
      pluginSecret: PLUGIN_SECRET,
      userKey: USER_KEY,
    });

    // 搜索一个工作项用于测试
    const searchRes = await (client as any).request({
      method: "POST",
      path: `/open_api/${PROJECT_KEY}/work_item/filter`,
      body: { work_item_type_keys: [WORK_ITEM_TYPE], page_size: 1 },
    });

    const items = searchRes?.data || [];
    if (items.length === 0) {
      throw new Error(
        `在空间 ${PROJECT_KEY} 下未找到类型为 ${WORK_ITEM_TYPE} 的工作项`,
      );
    }
    workItemId = String(items[0].id);
    console.log(`测试工作项: ${WORK_ITEM_TYPE}/${workItemId}`);
  });

  // ── URL 解析 ───────────────────────────────────────────

  describe("URL parsing", () => {
    it("should resolve params from URL", async () => {
      const url = `https://project.feishu.cn/${PROJECT_KEY}/${WORK_ITEM_TYPE}/detail/${workItemId}`;
      const result = await client.listWorkItemComments({ url });
      expect(result.err_code).toBe(0);
    });

    it("should throw when project_key is missing", async () => {
      await expect(
        client.listWorkItemComments({
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
        }),
      ).rejects.toThrow("缺少 project_key");
    });

    it("should throw when work_item_type is missing", async () => {
      await expect(
        client.listWorkItemComments({
          project_key: PROJECT_KEY,
          work_item_id: workItemId,
        }),
      ).rejects.toThrow("缺少 work_item_type");
    });

    it("should throw when work_item_id is missing", async () => {
      await expect(
        client.listWorkItemComments({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
        }),
      ).rejects.toThrow("缺少 work_item_id");
    });
  });

  // ── 描述更新 ──────────────────────────────────────────

  describe("updateWorkItemDescription", () => {
    it("should throw when description is empty", async () => {
      await expect(
        client.updateWorkItemDescription({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          description: "  ",
        }),
      ).rejects.toThrow("description 不能为空");
    });
  });

  // ── 评论 CRUD ─────────────────────────────────────────

  describe("comments", () => {
    let createdCommentId: string;

    it("should throw when content is empty", async () => {
      await expect(
        client.createWorkItemComment({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          content: "",
        }),
      ).rejects.toThrow("content 不能为空");
    });

    it("should create a comment", async () => {
      const result = await client.createWorkItemComment({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
        content: `[测试] ${new Date().toISOString()}`,
      });

      expect(result.err_code).toBe(0);
      createdCommentId = String(result.data);
      expect(createdCommentId).toBeTruthy();
    });

    it("should list comments and find the created one", async () => {
      const result = await client.listWorkItemComments({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
      });

      expect(result.err_code).toBe(0);
      expect(Array.isArray(result.data)).toBe(true);

      const found = result.data.some(
        (c: any) => String(c.id) === createdCommentId,
      );
      expect(found).toBe(true);
    });

    it("should throw when comment_id is missing", async () => {
      await expect(
        client.deleteWorkItemComment({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          comment_id: "",
        }),
      ).rejects.toThrow("缺少 comment_id");
    });

    it("should delete the comment", async () => {
      const result = await client.deleteWorkItemComment({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
        comment_id: createdCommentId,
      });

      expect(result.err_code).toBe(0);
    });

    it("should confirm comment was deleted", async () => {
      const result = await client.listWorkItemComments({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
      });

      const found = result.data?.some(
        (c: any) => String(c.id) === createdCommentId,
      );
      expect(found).toBe(false);
    });
  });
});
