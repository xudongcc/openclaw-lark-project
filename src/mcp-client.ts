export type SearchByMqlParams = {
  project_key: string;
  moql?: string;
  session_id?: string;
  group_pagination_list?: Array<{
    group_id?: string;
    page_num?: number;
  }>;
};

type JsonRpcResult<T = any> = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: any };
};

export class FeishuProjectMcpClient {
  private id = 1;
  constructor(
    private readonly mcpBaseUrl: string,
    private readonly getPluginToken: () => Promise<string>,
  ) {}

  private async rpc<T = any>(method: string, params: any): Promise<T> {
    const pluginToken = await this.getPluginToken();
    const body = {
      jsonrpc: "2.0",
      id: this.id++,
      method,
      params,
    };

    const res = await fetch(this.mcpBaseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Plugin-Token": pluginToken,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP ${method} failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as JsonRpcResult<T>;
    if (data?.error) {
      throw new Error(`MCP ${method} error: ${data.error.message}`);
    }
    return (data?.result ?? ({} as T)) as T;
  }

  async searchByMql(params: SearchByMqlParams) {
    return this.rpc("tools/call", {
      name: "mcp__feishu-project__search_by_mql",
      arguments: params,
    });
  }
}
