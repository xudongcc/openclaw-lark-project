export type OpenApiClientConfig = {
  baseUrl: string;
  getPluginToken: () => Promise<string>;
  getUserToken: () => Promise<string>;
  userKey: string;
};

export type ToolName =
  | "create_workitem"
  | "finish_node"
  | "get_node_detail"
  | "get_view_detail"
  | "get_workitem_brief"
  | "get_workitem_info"
  | "list_schedule"
  | "list_todo"
  | "search_by_mql"
  | "update_field";

const ENDPOINTS: Record<ToolName, string> = {
  // TODO: 用官方文档中的精确 endpoint 替换以下占位路径
  create_workitem: "/open_api/work_item/create",
  finish_node: "/open_api/work_item/finish_node",
  get_node_detail: "/open_api/work_item/node/detail",
  get_view_detail: "/open_api/view/detail",
  get_workitem_brief: "/open_api/work_item/detail",
  get_workitem_info: "/open_api/work_item/info",
  list_schedule: "/open_api/schedule/list",
  list_todo: "/open_api/todo/list",
  search_by_mql: "/open_api/moql/search",
  update_field: "/open_api/work_item/update_field",
};

export class FeishuProjectOpenApiClient {
  constructor(private readonly cfg: OpenApiClientConfig) {}

  private async request(path: string, body: any, authMode: "user" | "plugin" = "user") {
    const token = authMode === "user" ? await this.cfg.getUserToken() : await this.cfg.getPluginToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Plugin-Token": token,
    };

    if (authMode === "plugin") headers["X-User-Key"] = this.cfg.userKey;

    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // keep raw text for debugging
    }

    if (!res.ok) {
      throw new Error(`OpenAPI ${path} failed: HTTP ${res.status}; body=${text.slice(0, 400)}`);
    }
    return json ?? { raw: text };
  }

  async callTool(name: ToolName, params: any) {
    return this.request(ENDPOINTS[name], params, "user");
  }
}
