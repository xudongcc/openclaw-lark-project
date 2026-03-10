import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SearchByMqlParams, SearchByMqlResult, ListScheduleResult } from "./types";

export interface LarkProjectMCPClientOptions {
  /** MCP Server 的 mcpKey */
  mcpKey: string;
  /** 用户标识 */
  userKey: string;
}

export interface ListScheduleParams {
  /** 空间标识 */
  project_key: string;
  /** 开始时间，格式 2006-01-01 */
  start_time: string;
  /** 结束时间，格式 2006-01-01 */
  end_time: string;
  /** 用户标识列表（名称、邮箱或 user_id），最多 20 个 */
  user_ids: string[];
  /** 工作项类型标识列表，如 ["story", "issue"]，传 ["_all"] 查所有类型 */
  work_item_type_keys?: string[];
}

/** @internal */
const BASE_URL = "https://project.feishu.cn/mcp_server/v1";

/**
 * 飞书项目 MCP 客户端。
 *
 * @remarks
 * 通过 Streamable HTTP 连接飞书项目 MCP Server，
 * 封装 `search_by_mql` 和 `list_schedule` 两个 MCP 工具调用。
 */
export class LarkProjectMCPClient {
  private readonly mcpKey: string;
  private readonly userKey: string;
  private client?: Client;
  private connected = false;

  constructor(options: LarkProjectMCPClientOptions) {
    this.mcpKey = options.mcpKey;
    this.userKey = options.userKey;
  }

  /**
   * 确保 MCP 连接已建立（懒连接）。
   *
   * @internal
   */
  private async ensureConnected(): Promise<Client> {
    if (this.client && this.connected) {
      return this.client;
    }

    const url = new URL(BASE_URL);
    url.searchParams.set("mcpKey", this.mcpKey);
    url.searchParams.set("userKey", this.userKey);

    const transport = new StreamableHTTPClientTransport(url);
    this.client = new Client({
      name: "openclaw-lark-project",
      version: "1.0.0",
    });

    await this.client.connect(transport);
    this.connected = true;
    return this.client;
  }

  /**
   * 调用 MCP 工具并返回结果。
   *
   * @internal
   */
  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const client = await this.ensureConnected();
    const result = await client.callTool({ name, arguments: args });

    // MCP tool 返回 content 数组：第一个 text 是 JSON 数据，后续可能有 log_id 等附加信息
    if (result.content && Array.isArray(result.content)) {
      const textItems = result.content.filter(
        (c: any) => c.type === "text",
      ) as { type: "text"; text: string }[];

      for (const item of textItems) {
        try {
          return JSON.parse(item.text);
        } catch {
          // 非 JSON（如 log_id），跳过
        }
      }

      // 全部都不是 JSON，返回拼接文本
      return textItems.map((c) => c.text).join("\n");
    }
    return result;
  }

  /**
   * 使用 MOQL 查询工作项列表。
   *
   * @param params - 查询参数
   * @returns MCP 工具返回的查询结果
   */
  async searchByMql(params: SearchByMqlParams): Promise<SearchByMqlResult> {
    if (!params.project_key) {
      throw new Error("缺少 project_key");
    }

    const args: Record<string, unknown> = {
      project_key: params.project_key,
    };
    
    if (params.moql) {
      args.moql = params.moql;
    }
    if (params.session_id) {
      args.session_id = params.session_id;
    }

    if (params.group_pagination_list) {
      args.group_pagination_list = params.group_pagination_list;
    } else if (params.page_num !== undefined) {
      args.group_pagination_list = [
        { page_num: params.page_num },
      ];
    }

    return this.callTool("search_by_mql", args) as Promise<SearchByMqlResult>;
  }

  /**
   * 查询人员排期与工作量明细。
   *
   * @param params - 查询参数
   * @returns MCP 工具返回的排期数据
   */
  async listSchedule(params: ListScheduleParams): Promise<ListScheduleResult> {
    if (!params.project_key) {
      throw new Error("缺少 project_key");
    }
    if (!params.start_time) {
      throw new Error("缺少 start_time");
    }
    if (!params.end_time) {
      throw new Error("缺少 end_time");
    }
    if (!Array.isArray(params.user_ids) || params.user_ids.length === 0) {
      throw new Error("缺少 user_ids");
    }

    const args: Record<string, unknown> = {
      project_key: params.project_key,
      start_time: params.start_time,
      end_time: params.end_time,
      user_keys: params.user_ids, // 这里传给服务端依然用 user_keys
    };
    if (params.work_item_type_keys) {
      args.work_item_type_keys = params.work_item_type_keys;
    }

    return this.callTool("list_schedule", args) as Promise<ListScheduleResult>;
  }

  /**
   * 关闭 MCP 连接。
   */
  async close(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.close();
      this.connected = false;
      this.client = undefined;
    }
  }
}
