export type OpenApiClientConfig = {
  baseUrl: string;
  getPluginToken: () => Promise<string>;
  userKey: string;
};

export type ToolName = "update_workitem_description";

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

    if (!res.ok) {
      throw new Error(`OpenAPI ${method} ${path} failed: HTTP ${res.status}; body=${text.slice(0, 500)}`);
    }

    const code = json?.code;
    if (typeof code === "number" && code !== 0) {
      throw new Error(`OpenAPI ${method} ${path} business failed: code=${code}; msg=${json?.msg || "unknown"}`);
    }

    return json ?? { raw: text };
  }

  async callTool(name: ToolName, params: any) {
    const parsed = fromUrl(params?.url);
    const project_key = params?.project_key || parsed.project_key;
    const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
    const work_item_id = params?.work_item_id || parsed.work_item_id;

    if (!project_key) throw new Error("缺少 project_key（可通过 project_key 或 url 提供）");
    if (!work_item_type_key) throw new Error("缺少 work_item_type/work_item_type_key（可通过参数或 url 提供）");
    if (!work_item_id) throw new Error("缺少 work_item_id（可通过参数或 url 提供）");

    switch (name) {
      case "update_workitem_description": {
        const description = params?.description;
        if (typeof description !== "string" || !description.trim()) {
          throw new Error("description 不能为空");
        }

        const fieldKey = params?.field_key || "description";
        return this.request({
          method: "PUT",
          path: `/open_api/${project_key}/work_item/${work_item_type_key}/${work_item_id}`,
          body: {
            update_fields: [
              {
                field_key: fieldKey,
                field_value: description,
              },
            ],
          },
        });
      }
      default:
        throw new Error(`unsupported tool: ${name}`);
    }
  }
}
