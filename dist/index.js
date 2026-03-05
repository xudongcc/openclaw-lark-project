function fromUrl(input) {
  if (!input) return {};
  const m = input.match(/project\.feishu\.cn\/([^/]+)\/([^/]+)(?:\/detail\/([^/?#]+))?/);
  return {
    project_key: m?.[1],
    work_item_type: m?.[2],
    work_item_id: m?.[3],
  };
}

class TokenManager {
  constructor(cfg) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.pluginId = cfg.pluginId;
    this.pluginSecret = cfg.pluginSecret;
    this.pluginToken = null;
  }

  async getPluginAccessToken() {
    if (this.pluginToken && this.pluginToken.expiresAt > Date.now() + 30000) {
      return this.pluginToken.token;
    }

    const res = await fetch(`${this.baseUrl}/open_api/authen/plugin_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plugin_id: this.pluginId,
        plugin_secret: this.pluginSecret,
      }),
    });

    if (!res.ok) throw new Error(`get plugin_access_token failed: HTTP ${res.status}`);

    const data = await res.json();
    const token = data?.data?.plugin_access_token || data?.plugin_access_token;
    const expire = Number(data?.data?.expire_time || data?.expire_time || 7200);
    if (!token) throw new Error("plugin_access_token missing in response");

    this.pluginToken = { token, expiresAt: Date.now() + expire * 1000 };
    return token;
  }
}

class FeishuProjectOpenApiClient {
  constructor(cfg) {
    this.cfg = cfg;
  }

  async request({ method, path, query, body }) {
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
    let json = null;
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

  async callTool(params) {
    const parsed = fromUrl(params?.url);
    const project_key = params?.project_key || parsed.project_key;
    const work_item_type_key = params?.work_item_type || params?.work_item_type_key || parsed.work_item_type;
    const work_item_id = params?.work_item_id || parsed.work_item_id;

    if (!project_key) throw new Error("缺少 project_key（可通过 project_key 或 url 提供）");
    if (!work_item_type_key) throw new Error("缺少 work_item_type/work_item_type_key（可通过参数或 url 提供）");
    if (!work_item_id) throw new Error("缺少 work_item_id（可通过参数或 url 提供）");

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
}

function wrapResult(result) {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function wrapError(tool, err) {
  return {
    content: [{ type: "text", text: `${tool} 失败: ${err?.message || String(err)}` }],
    isError: true,
  };
}

module.exports = function register(api) {
  const cfg = api?.config || {};
  const baseUrl = cfg.baseUrl || "https://project.feishu.cn";

  const tokenManager = new TokenManager({
    baseUrl,
    pluginId: cfg.pluginId,
    pluginSecret: cfg.pluginSecret,
  });

  const openapi = new FeishuProjectOpenApiClient({
    baseUrl,
    userKey: cfg.userKey,
    getPluginToken: () => tokenManager.getPluginAccessToken(),
  });

  api?.logger?.info?.("[lark-project-workitem] plugin loaded (description tool enabled)", {
    hasPluginId: Boolean(cfg.pluginId),
    hasPluginSecret: Boolean(cfg.pluginSecret),
    hasUserKey: Boolean(cfg.userKey),
    baseUrl,
    enabledTools: ["update_workitem_description"],
  });

  api.registerTool(
    {
      name: "update_workitem_description",
      description:
        "更新工作项描述字段（用于补充 MCP update_field 在描述字段上的限制）。支持通过 url 自动解析 project_key/work_item_type/work_item_id。",
      parameters: {
        type: "object",
        required: ["description"],
        properties: {
          url: { type: "string" },
          project_key: { type: "string" },
          work_item_type: { type: "string", description: "如 story / issue / bug" },
          work_item_type_key: { type: "string", description: "work_item_type 的别名" },
          work_item_id: { type: "string" },
          description: { type: "string", description: "要写入的描述内容（支持 markdown 文本）" },
          field_key: { type: "string", description: "默认 description。仅在你的空间使用自定义描述字段 key 时传入。" }
        }
      },
      async execute(_id, params) {
        try {
          const result = await openapi.callTool(params);
          return wrapResult(result);
        } catch (err) {
          return wrapError("update_workitem_description", err);
        }
      }
    },
    { optional: true }
  );
};
