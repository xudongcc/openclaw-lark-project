export type LarkProjectOptions = {
  pluginId: string;
  pluginSecret: string;
  userKey: string;
};

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

function parseWorkitemUrl(input?: string) {
  if (!input) return {} as Record<string, string | undefined>;
  const m = input.match(
    /project\.feishu\.cn\/([^/]+)\/([^/]+)(?:\/detail\/([^/?#]+))?/,
  );
  return {
    project_key: m?.[1],
    work_item_type: m?.[2],
    work_item_id: m?.[3],
  };
}

const BASE_URL = "https://project.feishu.cn";

export class LarkProject {
  private readonly pluginId: string;
  private readonly pluginSecret: string;
  private readonly userKey: string;
  private pluginToken?: TokenCacheEntry;

  constructor(options: LarkProjectOptions) {
    this.pluginId = options.pluginId;
    this.pluginSecret = options.pluginSecret;
    this.userKey = options.userKey;
  }

  // ── Token management ──────────────────────────────────────

  private async getPluginAccessToken(): Promise<string> {
    if (this.pluginToken && this.pluginToken.expiresAt > Date.now() + 30_000) {
      return this.pluginToken.token;
    }

    const res = await fetch(`${BASE_URL}/open_api/authen/plugin_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plugin_id: this.pluginId,
        plugin_secret: this.pluginSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`get plugin_access_token failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const token = data?.data?.plugin_access_token || data?.plugin_access_token;
    const expire = Number(data?.data?.expire_time || data?.expire_time || 7200);
    if (!token) throw new Error("plugin_access_token missing in response");

    this.pluginToken = { token, expiresAt: Date.now() + expire * 1000 };
    return token;
  }

  // ── HTTP helper ───────────────────────────────────────────

  private async request(options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: any;
  }) {
    const token = await this.getPluginAccessToken();
    const qs = options.query
      ? "?" +
        Object.entries(options.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(
            ([k, v]) =>
              `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
          )
          .join("&")
      : "";

    const res = await fetch(`${BASE_URL}${options.path}${qs}`, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        "X-PLUGIN-TOKEN": token,
        "X-USER-KEY": this.userKey,
      },
      body:
        options.method === "GET"
          ? undefined
          : JSON.stringify(options.body || {}),
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {}

    if (!res.ok) {
      throw new Error(
        `OpenAPI ${options.method} ${options.path} failed: HTTP ${res.status}; body=${text.slice(0, 500)}`,
      );
    }

    const code = json?.code;
    if (typeof code === "number" && code !== 0) {
      throw new Error(
        `OpenAPI ${options.method} ${options.path} business failed: code=${code}; msg=${json?.msg || "unknown"}`,
      );
    }

    return json ?? { raw: text };
  }

  // ── Public API ────────────────────────────────────────────

  async updateWorkitemDescription(params: {
    url?: string;
    project_key?: string;
    work_item_type?: string;
    work_item_type_key?: string;
    work_item_id?: string;
    description: string;
    field_key?: string;
  }) {
    const parsed = parseWorkitemUrl(params.url);
    const projectKey = params.project_key || parsed.project_key;
    const workItemTypeKey =
      params.work_item_type ||
      params.work_item_type_key ||
      parsed.work_item_type;
    const workItemId = params.work_item_id || parsed.work_item_id;

    if (!projectKey)
      throw new Error("缺少 project_key（可通过 project_key 或 url 提供）");
    if (!workItemTypeKey)
      throw new Error(
        "缺少 work_item_type/work_item_type_key（可通过参数或 url 提供）",
      );
    if (!workItemId)
      throw new Error("缺少 work_item_id（可通过参数或 url 提供）");

    if (typeof params.description !== "string" || !params.description.trim()) {
      throw new Error("description 不能为空");
    }

    const fieldKey = params.field_key || "description";

    return this.request({
      method: "PUT",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}`,
      body: {
        update_fields: [
          {
            field_key: fieldKey,
            field_value: params.description,
          },
        ],
      },
    });
  }
}
