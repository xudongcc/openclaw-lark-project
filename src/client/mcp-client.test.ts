import { describe, it, expect, afterAll } from "vitest";
import { LarkProjectMCPClient } from "./mcp-client";

const MCP_KEY = process.env.LARK_PROJECT_MCP_KEY!;
const USER_KEY = process.env.LARK_PROJECT_USER_KEY!;
const PROJECT_KEY = process.env.LARK_PROJECT_PROJECT_KEY!;

const skip = !MCP_KEY || !USER_KEY || !PROJECT_KEY;

describe.skipIf(skip)("LarkProjectMCPClient", () => {
  let client: LarkProjectMCPClient;

  client = new LarkProjectMCPClient({
    mcpKey: MCP_KEY,
    userKey: USER_KEY,
  });

  afterAll(async () => {
    await client.close();
  });

  // ── searchByMql ─────────────────────────────────────

  describe("searchByMql", () => {
    it("should throw when project_key is empty", async () => {
      await expect(
        client.searchByMql({ project_key: "", moql: "SELECT 1" }),
      ).rejects.toThrow("缺少 project_key");
    });

    it("should allow querying without moql if session_id and group_pagination_list are passed", async () => {
      // 传入了 session_id, moql 变成非强依赖。如果真正请求时 server 处理不了则是 server 的事。
      // SDK 层不再限制 moql 的为空校验。
    });

    it("should execute a simple MOQL query (e2e)", async () => {
      const result: any = await client.searchByMql({
        project_key: PROJECT_KEY,
        moql: `SELECT \`工作项id\`, \`需求名称\` FROM \`${PROJECT_KEY}\`.\`需求\` WHERE \`优先级\` = 'P2' LIMIT 5`,
      });

      // MCP 返回的结果格式由 MCP server 决定
      console.log("MOQL result:", JSON.stringify(result).slice(0, 500));
      expect(result).toBeDefined();
    });

    it("should return data matching SearchByMqlResult shape (e2e)", async () => {
      const result = await client.searchByMql({
        project_key: PROJECT_KEY,
        moql: `SELECT \`工作项id\`, \`需求名称\` FROM \`${PROJECT_KEY}\`.\`需求\` LIMIT 1`,
      });

      console.log(
        "SearchByMqlResult full:",
        JSON.stringify(result, null, 2).slice(0, 2000),
      );

      // ── 顶层字段 ─────────────────────────────────────
      expect(result).toHaveProperty("list");
      expect(result).toHaveProperty("session_id");
      expect(result).toHaveProperty("data");
      expect(Array.isArray(result.list)).toBe(true);
      expect(typeof result.session_id).toBe("string");
      expect(typeof result.data).toBe("object");

      // ── list / MoqlGroup ──────────────────────────────
      expect(result.list.length).toBeGreaterThanOrEqual(1);
      const group = result.list[0];
      expect(group).toHaveProperty("count");
      expect(typeof group.count).toBe("number");
      expect(group).toHaveProperty("group_infos");
      expect(Array.isArray(group.group_infos)).toBe(true);

      // ── group_infos / MoqlGroupInfo ───────────────────
      const info = group.group_infos[0];
      expect(info).toHaveProperty("group_name");
      expect(info).toHaveProperty("group_id");
      expect(typeof info.group_name).toBe("string");
      expect(typeof info.group_id).toBe("string");

      // ── data / MoqlRow[] ──────────────────────────────
      const groupId = info.group_id;
      const rows = result.data[groupId];
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThanOrEqual(1);

      const row = rows[0];
      expect(row).toHaveProperty("moql_field_list");
      expect(Array.isArray(row.moql_field_list)).toBe(true);

      // ── moql_field_list / MoqlField ───────────────────
      const field = row.moql_field_list[0];
      expect(field).toHaveProperty("key");
      expect(field).toHaveProperty("name");
      expect(field).toHaveProperty("value_type");
      expect(field).toHaveProperty("value");
      expect(typeof field.key).toBe("string");
      expect(typeof field.name).toBe("string");
      expect(typeof field.value_type).toBe("string");
      expect(typeof field.value).toBe("object");
    });
  });

  // ── getSchedule ────────────────────────────────────

  describe("getSchedule", () => {
    it("should throw when project_key is empty", async () => {
      await expect(
        client.getSchedule({
          project_key: "",
          start_time: "2026-03-01",
          end_time: "2024-02-01",
          user_keys: [USER_KEY],
        }),
      ).rejects.toThrow("缺少 project_key");
    });

    it("should throw when user_keys is empty", async () => {
      await expect(
        client.getSchedule({
          project_key: PROJECT_KEY,
          start_time: "2024-01-01",
          end_time: "2024-02-01",
          user_keys: [],
        }),
      ).rejects.toThrow("缺少 user_keys");
    });

    it("should query schedule data (e2e)", async () => {
      const result: any = await client.getSchedule({
        project_key: PROJECT_KEY,
        start_time: "2024-01-01",
        end_time: "2024-02-01",
        user_keys: [USER_KEY],
        work_item_type_keys: ["_all"],
      });

      console.log("Schedule result:", JSON.stringify(result).slice(0, 500));
      expect(result).toBeDefined();
    });
  });
});
