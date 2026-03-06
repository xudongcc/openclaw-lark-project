import { describe, it, expect, beforeAll } from "vitest";
import { LarkProject } from "./sdk";

const PLUGIN_ID = process.env.LARK_PROJECT_PLUGIN_ID!;
const PLUGIN_SECRET = process.env.LARK_PROJECT_PLUGIN_SECRET!;
const PROJECT_KEY = process.env.LARK_PROJECT_PROJECT_KEY!;
const USER_KEY = process.env.LARK_PROJECT_USER_KEY!;

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

  // ── 描述更新（通过 updateWorkItemField） ─────────────────

  describe("updateDescription via updateWorkItemField", () => {
    it("should update description field", async () => {
      const result = await client.updateWorkItemField({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
        update_fields: [
          {
            field_key: "description",
            field_value: `# 测试描述\n\n更新于 ${new Date().toISOString()}`,
          },
        ],
      });

      expect(result.err_code).toBe(0);
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

  // ── 角色人员 ──────────────────────────────────────────

  describe("updateWorkItemRoleOwners", () => {
    it("should throw when role_owners is empty", async () => {
      await expect(
        client.updateWorkItemRoleOwners({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          role_owners: [],
        }),
      ).rejects.toThrow("role_owners 不能为空");
    });

    it("should update role owners", async () => {
      // 先获取工作项详情，从 fields 中拿到 role_owners
      const detail = await (client as any).request({
        method: "POST",
        path: `/open_api/${PROJECT_KEY}/work_item/${WORK_ITEM_TYPE}/query`,
        body: {
          work_item_ids: [Number(workItemId)],
          fields: ["role_owners"],
        },
      });

      const item = detail?.data?.[0];
      const roleField = item?.fields?.find(
        (f: any) => f.field_key === "role_owners",
      );
      const roleOwners = roleField?.field_value;

      if (!Array.isArray(roleOwners) || roleOwners.length === 0) {
        console.log("跳过 role_owners 更新测试：无法从工作项详情获取角色信息");
        return;
      }

      // 用第一个角色做更新测试，将当前用户设为该角色的 owner
      const firstRole = roleOwners[0].role;
      const result = await client.updateWorkItemRoleOwners({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
        role_owners: [{ role: firstRole, owners: [USER_KEY] }],
      });

      expect(result.err_code).toBe(0);
    });
  });

  // ── 业务线 ──────────────────────────────────────────

  describe("listBusinesses", () => {
    it("should throw when project_key is empty", async () => {
      await expect(
        client.listBusinesses({ project_key: "" }),
      ).rejects.toThrow("缺少 project_key");
    });

    it("should list businesses for the project", async () => {
      const result = await client.listBusinesses({
        project_key: PROJECT_KEY,
      });

      expect(result.err_code).toBe(0);
      expect(Array.isArray(result.data)).toBe(true);
      console.log(
        `业务线列表: ${JSON.stringify(result.data?.map((b: any) => ({ id: b.id, name: b.name })))}`,
      );
    });
  });

  // ── 通用字段更新（业务线） ─────────────────────────────

  describe("updateWorkItemField", () => {
    it("should throw when update_fields is empty", async () => {
      await expect(
        client.updateWorkItemField({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          update_fields: [],
        }),
      ).rejects.toThrow("update_fields 不能为空");
    });

    it("should update business field", async () => {
      // 先获取业务线列表，找到第一个业务线 ID
      const bizResult = await client.listBusinesses({
        project_key: PROJECT_KEY,
      });

      const businesses = bizResult?.data || [];
      if (!Array.isArray(businesses) || businesses.length === 0) {
        console.log("跳过业务线更新测试：空间下无业务线");
        return;
      }

      const targetBizId = String(businesses[0].id);
      console.log(
        `使用业务线: ${businesses[0].name} (${targetBizId})`,
      );

      const result = await client.updateWorkItemField({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
        update_fields: [
          {
            field_key: "business",
            field_value: targetBizId,
          },
        ],
      });

      expect(result.err_code).toBe(0);
    });
  });
});
