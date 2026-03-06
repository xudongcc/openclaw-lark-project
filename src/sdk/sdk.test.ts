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
      await expect(client.listBusinesses({ project_key: "" })).rejects.toThrow(
        "缺少 project_key",
      );
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
      console.log(`使用业务线: ${businesses[0].name} (${targetBizId})`);

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

  // ── 获取工作流详情 ────────────────────────────────────

  describe("getWorkItemWorkflow", () => {
    it("should get workflow details", async () => {
      const result = await client.getWorkItemWorkflow({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: workItemId,
      });

      expect(result.err_code).toBe(0);
      expect(result.data).toBeDefined();
      console.log(`工作流模式: ${result.data?.pattern || "unknown"}`);
    });
  });

  // ── 完成节点（节点流） ──────────────────────────

  describe("confirmNode", () => {
    it("should throw when node_id is missing", async () => {
      await expect(
        client.confirmNode({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          node_id: "",
        }),
      ).rejects.toThrow("缺少 node_id");
    });
  });

  // ── 回滚节点（节点流） ──────────────────────────

  describe("rollbackNode", () => {
    it("should throw when node_id is missing", async () => {
      await expect(
        client.rollbackNode({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          node_id: "",
          rollback_reason: "test",
        }),
      ).rejects.toThrow("缺少 node_id");
    });

    it("should throw when rollback_reason is missing", async () => {
      await expect(
        client.rollbackNode({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: workItemId,
          node_id: "some_node",
          rollback_reason: "",
        }),
      ).rejects.toThrow("缺少 rollback_reason");
    });
  });

  // ── 节点完成 + 回滚 e2e ──────────────────────────

  describe("confirmNode + rollbackNode (e2e)", () => {
    it("should confirm and rollback a node", async () => {
      // 1. 动态创建测试专用工作项
      const createRes = await client.createWorkItem({
        project_key: PROJECT_KEY,
        work_item_type_key: WORK_ITEM_TYPE,
        name: `[自动化测试] 节点流转 ${new Date().toISOString()}`,
      });
      expect(createRes.err_code).toBe(0);
      const tempWorkItemId = String(createRes.data);
      console.log(`临时工作项(节点流)已创建: ${tempWorkItemId}`);

      try {
        // 2. 获取工作流详情
        const wf = await client.getWorkItemWorkflow({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: tempWorkItemId,
        });

        expect(wf.err_code).toBe(0);
        console.log(
          `节点流返回 data keys: ${JSON.stringify(Object.keys(wf.data || {}))}`,
        );

        // 根据飞书官方文档，node 流返回固定为 workflow_nodes 数组
        const nodes = wf.data?.workflow_nodes || [];

        if (!Array.isArray(nodes) || nodes.length === 0) {
          console.log(
            `节点流完整 data: ${JSON.stringify(wf.data, null, 2).slice(0, 1000)}`,
          );
          console.log("跳过节点流转 e2e 测试：无法获取节点列表");
          return;
        }

        console.log(
          `工作流节点: ${JSON.stringify(nodes.map((n: any) => ({ id: n.id, name: n.name, status: n.status })))}`,
        );

        // 找到一个当前已到达但未完成的节点（status=2 表示已到达）
        const arrivedNode = nodes.find((n: any) => n.status === 2);

        if (!arrivedNode) {
          console.log("跳过节点流转 e2e 测试：没有已到达但未完成的节点");
          return;
        }

        const nodeId = arrivedNode.id;
        console.log(`测试节点: ${arrivedNode.name} (${nodeId})`);

        // 完成节点（需传入负责人）
        const owners = arrivedNode.owners?.length
          ? arrivedNode.owners
          : [USER_KEY];
        const confirmResult = await client.confirmNode({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: tempWorkItemId,
          node_id: nodeId,
          node_owners: owners,
        });

        expect(confirmResult.err_code).toBe(0);
        console.log(`节点 ${nodeId} 完成成功`);

        // 回滚节点（恢复原状）
        const rollbackResult = await client.rollbackNode({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: tempWorkItemId,
          node_id: nodeId,
          rollback_reason: "e2e 测试回滚",
        });

        expect(rollbackResult.err_code).toBe(0);
        console.log(`节点 ${nodeId} 回滚成功`);
      } finally {
        // 3. 清理临时工作项
        await client.abortWorkItem({
          project_key: PROJECT_KEY,
          work_item_type: WORK_ITEM_TYPE,
          work_item_id: tempWorkItemId,
          reason: "自动化测试结束清理",
        });
        console.log(`临时工作项(节点流)已销毁: ${tempWorkItemId}`);
      }
    });
  });

  // ── 状态流转（状态流） ──────────────────────────────

  describe("changeState", () => {
    const ISSUE_URL =
      "https://project.feishu.cn/openclaw/issue/detail/6863497498";

    it("should throw when transition_id is missing", async () => {
      await expect(
        client.changeState({
          url: ISSUE_URL,
          transition_id: "",
        }),
      ).rejects.toThrow("缺少 transition_id");
    });

    it("should perform state change and revert (e2e)", async () => {
      // 1. 动态创建测试专用工作项
      const createRes = await client.createWorkItem({
        project_key: PROJECT_KEY,
        work_item_type_key: "issue", // 状态流通常用 issue
        name: `[自动化测试] 状态流转 ${new Date().toISOString()}`,
      });
      expect(createRes.err_code).toBe(0);
      const tempIssueId = String(createRes.data);
      console.log(`临时工作项(状态流)已创建: issue/${tempIssueId}`);

      try {
        const TEMP_ISSUE_URL = `https://project.feishu.cn/${PROJECT_KEY}/issue/detail/${tempIssueId}`;

        // 2. 获取工作流详情（状态流）
        const wf = await client.getWorkItemWorkflow({ url: TEMP_ISSUE_URL });

        expect(wf.err_code).toBe(0);

        // 从 state_flow_nodes 获取当前状态（status=2 表示当前所处状态）
        const stateNodes = wf.data?.state_flow_nodes || [];
        const currentNode = stateNodes.find((n: any) => n.status === 2);
        const currentState = currentNode?.id;
        console.log(`当前状态: ${currentState} (${currentNode?.name})`);

        // 从 connections 获取可用流转
        const connections = wf.data?.connections || [];
        console.log(
          `connections: ${JSON.stringify(connections.map((c: any) => ({ from: c.source_state_key, to: c.target_state_key, tid: c.transition_id })))}`,
        );

        if (connections.length === 0) {
          console.log("connections 为空，跳过状态流转 e2e 测试");
          return;
        }

        // 找到从当前状态出发的流转
        const transition = connections.find(
          (c: any) => c.source_state_key === currentState,
        );

        if (!transition) {
          console.log(`没有从 ${currentState} 出发的流转`);
          return;
        }

        const transitionId = String(transition.transition_id);
        const targetState = transition.target_state_key;
        console.log(`执行流转: ${transitionId} → ${targetState}`);

        // 执行状态流转
        const result = await client.changeState({
          url: TEMP_ISSUE_URL,
          transition_id: transitionId,
        });

        expect(result.err_code).toBe(0);
        console.log(`状态流转成功 → ${targetState}`);

        // 尝试流转回原状态
        const wf2 = await client.getWorkItemWorkflow({ url: TEMP_ISSUE_URL });
        const reverseConnections = wf2.data?.connections || [];
        const reverseTransition = reverseConnections.find(
          (c: any) =>
            c.source_state_key === targetState &&
            c.target_state_key === currentState,
        );

        if (reverseTransition) {
          const reverseId = String(reverseTransition.transition_id);
          const revert = await client.changeState({
            url: TEMP_ISSUE_URL,
            transition_id: reverseId,
          });
          expect(revert.err_code).toBe(0);
          console.log(`状态已恢复 → ${currentState}`);
        } else {
          console.log("无法恢复原状态：没有找到反向流转，请手动恢复");
        }
      } finally {
        // 3. 清理临时工作项
        await client.abortWorkItem({
          project_key: PROJECT_KEY,
          work_item_type: "issue",
          work_item_id: tempIssueId,
          reason: "自动化测试结束清理",
        });
        console.log(`临时工作项(状态流)已销毁: ${tempIssueId}`);
      }
    });
  });

  // ── 创建工作项 ─────────────────────────────────────

  describe("createWorkItem", () => {
    it("should throw when project_key is missing", async () => {
      await expect(
        client.createWorkItem({
          project_key: "",
          work_item_type_key: "story",
          name: "test",
        }),
      ).rejects.toThrow("缺少 project_key");
    });

    it("should throw when work_item_type_key is missing", async () => {
      await expect(
        client.createWorkItem({
          project_key: PROJECT_KEY,
          work_item_type_key: "",
          name: "test",
        }),
      ).rejects.toThrow("缺少 work_item_type_key");
    });

    it("should throw when name is missing", async () => {
      await expect(
        client.createWorkItem({
          project_key: PROJECT_KEY,
          work_item_type_key: "story",
          name: "",
        }),
      ).rejects.toThrow("缺少 name");
    });
  });

  // ── 创建 + 终止工作项 e2e ─────────────────────────

  describe("createWorkItem + deleteWorkItem (e2e)", () => {
    let createdWorkItemId: string;

    it("should create a work item with field_value_pairs", async () => {
      const result = await client.createWorkItem({
        project_key: PROJECT_KEY,
        work_item_type_key: WORK_ITEM_TYPE,
        name: `[自动化测试] ${new Date().toISOString()}`,
        field_value_pairs: [
          {
            field_key: "priority",
            field_value: { label: "P2", value: "2" },
            field_type_key: "select",
          },
        ],
      });

      expect(result.err_code).toBe(0);
      createdWorkItemId = String(result.data);
      console.log(`创建工作项成功(含优先级): ${WORK_ITEM_TYPE}/${createdWorkItemId}`);
    });

    it("should abort the created work item", async () => {
      expect(createdWorkItemId).toBeTruthy();

      const result = await client.abortWorkItem({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: createdWorkItemId,
        reason: "自动化测试清理",
      });

      expect(result.err_code).toBe(0);
      console.log(`终止工作项成功: ${createdWorkItemId}`);
    });

    it("should restore the aborted work item", async () => {
      expect(createdWorkItemId).toBeTruthy();

      const result = await client.abortWorkItem({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: createdWorkItemId,
        is_aborted: false,
        reason: "自动化测试恢复验证",
      });

      expect(result.err_code).toBe(0);
      console.log(`恢复工作项成功: ${createdWorkItemId}`);
    });

    it("should abort again for final cleanup", async () => {
      expect(createdWorkItemId).toBeTruthy();

      const result = await client.abortWorkItem({
        project_key: PROJECT_KEY,
        work_item_type: WORK_ITEM_TYPE,
        work_item_id: createdWorkItemId,
        reason: "自动化测试最终清理",
      });

      expect(result.err_code).toBe(0);
      console.log(`最终清理成功: ${createdWorkItemId}`);
    });
  });
});
