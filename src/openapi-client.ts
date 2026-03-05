export type OpenApiClientConfig = {
  baseUrl: string;
  getPluginToken: () => Promise<string>;
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

type RequestArgs = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: any;
};

function fromUrl(input?: string) {
  if (!input) return {} as any;
  const m = input.match(/project\.feishu\.cn\/([^/]+)\/([^/]+)(?:\/detail\/([^/?#]+))?/);
  // /{project_key}/{work_item_type}/detail/{work_item_id}
  return {
    project_key: m?.[1],
    work_item_type: m?.[2],
    work_item_id: m?.[3],
  };
}

export class FeishuProjectOpenApiClient {
  constructor(private readonly cfg: OpenApiClientConfig) {}

  private async request({ method, path, query, body }: RequestArgs) {
    const token = await this.cfg.getPluginToken();
    const qs = query
      ? "?" +
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join("&")
      : "";

    const res = await fetch(`${this.cfg.baseUrl}${path}${qs}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-PLUGIN-TOKEN": token,
        "X-USER-KEY": this.cfg.userKey,
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) throw new Error(`OpenAPI ${method} ${path} failed: HTTP ${res.status}; body=${text.slice(0, 300)}`);
    return json ?? { raw: text };
  }

  async callTool(name: ToolName, params: any) {
    const parsed = fromUrl(params?.url);
    const project_key = params?.project_key || parsed.project_key;

    switch (name) {
      case "get_workitem_info": {
        const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
        return this.request({
          method: "GET",
          path: `/open_api/${project_key}/work_item/type/${work_item_type_key}`,
        });
      }
      case "create_workitem": {
        const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
        return this.request({
          method: "POST",
          path: `/open_api/${project_key}/work_item/create`,
          body: {
            work_item_type_key,
            field_value_pairs: params?.fields || [],
            name: params?.name,
            template_id: params?.template_id,
          },
        });
      }
      case "update_field": {
        const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
        const work_item_id = params?.work_item_id || parsed.work_item_id;
        return this.request({
          method: "PUT",
          path: `/open_api/${project_key}/work_item/${work_item_type_key}/${work_item_id}`,
          body: { update_fields: params?.fields || [] },
        });
      }
      case "get_workitem_brief": {
        const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
        const work_item_id = params?.work_item_id || parsed.work_item_id;
        return this.request({
          method: "POST",
          path: `/open_api/${project_key}/work_item/${work_item_type_key}/query`,
          body: { work_item_ids: [Number(work_item_id) || work_item_id], fields: params?.fields || [] },
        });
      }
      case "finish_node": {
        const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
        const work_item_id = params?.work_item_id || parsed.work_item_id;
        return this.request({
          method: "POST",
          path: `/open_api/${project_key}/workflow/${work_item_type_key}/${work_item_id}/node/${params?.node_id}/operate`,
          body: { action: params?.action || "finish" },
        });
      }
      case "get_node_detail": {
        const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
        const work_item_id = params?.work_item_id || parsed.work_item_id;
        return this.request({
          method: "POST",
          path: `/open_api/${project_key}/work_item/${work_item_type_key}/${work_item_id}/workflow/query`,
          body: { fields: params?.fields || [] },
        });
      }
      case "get_view_detail": {
        return this.request({
          method: "GET",
          path: `/open_api/${project_key}/fix_view/${params?.view_id}`,
          query: { page_size: 50, page_num: params?.page_num || 1, quick_filter_id: params?.quick_filter_id },
        });
      }
      case "list_schedule":
      case "list_todo":
      case "search_by_mql":
        throw new Error(`${name} 在你给的 OpenAPI Postman 模板中未找到直接对应 endpoint，需你确认官方接口路径`);
      default:
        throw new Error(`unsupported tool: ${name}`);
    }
  }
}
