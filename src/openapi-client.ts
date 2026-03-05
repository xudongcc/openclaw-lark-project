export type OpenApiClientConfig = {
  baseUrl: string;
  getPluginToken: () => Promise<string>;
  getUserToken: () => Promise<string>;
  userKey: string;
};

export class FeishuProjectOpenApiClient {
  constructor(private readonly cfg: OpenApiClientConfig) {}

  private async request(path: string, body: any, authMode: "user" | "plugin" = "user") {
    const token = authMode === "user" ? await this.cfg.getUserToken() : await this.cfg.getPluginToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Plugin-Token": token,
    };

    // plugin token 模式下，补充用户身份
    if (authMode === "plugin") {
      headers["X-User-Key"] = this.cfg.userKey;
    }

    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });

    if (!res.ok) throw new Error(`OpenAPI ${path} failed: HTTP ${res.status}`);
    return res.json();
  }

  // 借鉴 MCP search_by_mql 的参数结构，但底层走 OpenAPI
  async searchByMoql(params: {
    project_key: string;
    moql?: string;
    session_id?: string;
    group_pagination_list?: Array<{ group_id?: string; page_num?: number }>;
  }) {
    return this.request("/open_api/moql/search", params, "user");
  }

  async getWorkitemInfo(params: { project_key: string; work_item_type_key?: string }) {
    return this.request("/open_api/work_item/info", params, "user");
  }

  async updateWorkitemStatus(params: {
    project_key: string;
    work_item_type_key: string;
    work_item_id: string;
    status: string;
  }) {
    return this.request("/open_api/work_item/update", params, "user");
  }
}
