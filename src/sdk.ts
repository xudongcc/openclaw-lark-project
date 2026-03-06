/**
 * Options for initializing a {@link LarkProject} client.
 */
export type LarkProjectOptions = {
  /** 飞书项目插件 ID，格式如 `MII_*` */
  pluginId: string;
  /** 飞书项目插件密钥 */
  pluginSecret: string;
  /** 用户标识，格式如 `ou_*` 或 `user_*` */
  userKey: string;
};

/** @internal */
type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

/**
 * 从飞书项目工作项详情页 URL 中解析 `project_key`、`work_item_type`、`work_item_id`。
 *
 * @param input - 工作项详情页完整 URL
 * @returns 解析出的各字段，未匹配到时值为 `undefined`
 *
 * @internal
 */
function parseWorkItemUrl(input?: string) {
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

/** @internal */
const BASE_URL = "https://project.feishu.cn";

/**
 * 飞书项目 API 返回的 ID 超过 `Number.MAX_SAFE_INTEGER`，
 * 直接 `JSON.parse` 会丢失精度。此函数先将 16 位及以上的纯数字值
 * 转为字符串再解析。
 *
 * @param text - 原始 JSON 字符串
 * @returns 解析后的对象（大整数已转为字符串）
 *
 * @internal
 */
function safeParse(text: string): any {
  const safe = text.replace(/:\s*(\d{16,})\b/g, ': "$1"');
  return JSON.parse(safe);
}

/**
 * 飞书项目 OpenAPI 客户端。
 *
 * @remarks
 * 封装了 plugin_access_token 鉴权、请求发送和大整数精度修复，
 * 提供工作项描述更新和评论管理能力。
 *
 * @example
 * ```ts
 * const client = new LarkProject({
 *   pluginId: "MII_xxx",
 *   pluginSecret: "xxx",
 *   userKey: "ou_xxx",
 * });
 *
 * await client.createWorkItemComment({
 *   url: "https://project.feishu.cn/proj/story/detail/123",
 *   content: "这是一条评论",
 * });
 * ```
 */
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

  /**
   * 获取或刷新 plugin_access_token。
   *
   * @remarks
   * 在 token 过期前 30 秒自动刷新，支持 `data.token` 和
   * `data.plugin_access_token` 两种响应格式。
   *
   * @returns plugin_access_token 字符串
   * @throws 当 HTTP 请求失败或响应中缺少 token 时抛出异常
   *
   * @internal
   */
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

    const text = await res.text();

    if (!res.ok) {
      throw new Error(
        `get plugin_access_token failed: HTTP ${res.status}; body=${text.slice(0, 500)}`,
      );
    }

    const data = safeParse(text);
    const token =
      data?.data?.token ||
      data?.data?.plugin_access_token ||
      data?.plugin_access_token;
    const expire = Number(data?.data?.expire_time || data?.expire_time || 7200);
    if (!token)
      throw new Error(
        `plugin_access_token missing in response: ${JSON.stringify(data).slice(0, 500)}`,
      );

    this.pluginToken = { token, expiresAt: Date.now() + expire * 1000 };
    return token;
  }

  /**
   * 向飞书项目 OpenAPI 发送已鉴权的 HTTP 请求。
   *
   * @param options - 请求配置
   * @returns 解析后的 JSON 响应体
   * @throws HTTP 错误或业务错误码非零时抛出异常
   *
   * @internal
   */
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
      json = text ? safeParse(text) : null;
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

  /**
   * 从参数中解析工作项三元组（project_key、work_item_type、work_item_id）。
   *
   * @remarks
   * 支持从 `url` 自动解析，也支持显式传入各字段，显式字段优先级更高。
   *
   * @param params - 包含 url 或显式字段的参数对象
   * @returns 解析后的 `projectKey`、`workItemTypeKey`、`workItemId`
   * @throws 缺少必要字段时抛出异常
   *
   * @internal
   */
  private resolveWorkItem(params: {
    url?: string;
    project_key?: string;
    work_item_type?: string;
    work_item_type_key?: string;
    work_item_id?: string;
  }) {
    const parsed = parseWorkItemUrl(params.url);
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

    return { projectKey, workItemTypeKey, workItemId };
  }

  /**
   * 更新工作项描述字段。
   *
   * @remarks
   * 用于补充 MCP `update_field` 在描述字段上的限制。
   *
   * @param params - 工作项定位参数 + 描述内容
   * @param params.description - 描述内容（支持 markdown）
   * @param params.field_key - 描述字段 key，默认 `"description"`
   * @returns API 响应体
   * @throws 当 `description` 为空时抛出异常
   */
  async updateWorkItemDescription(params: {
    url?: string;
    project_key?: string;
    work_item_type?: string;
    work_item_type_key?: string;
    work_item_id?: string;
    description: string;
    field_key?: string;
  }) {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

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

  /**
   * 在工作项下添加一条纯文本评论。
   *
   * @param params - 工作项定位参数 + 评论内容
   * @param params.content - 评论内容（纯文本）
   * @returns API 响应体，`data` 字段为新评论 ID
   * @throws 当 `content` 为空时抛出异常
   */
  async createWorkItemComment(params: {
    url?: string;
    project_key?: string;
    work_item_type?: string;
    work_item_type_key?: string;
    work_item_id?: string;
    content: string;
  }) {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (typeof params.content !== "string" || !params.content.trim()) {
      throw new Error("content 不能为空");
    }

    return this.request({
      method: "POST",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}/comment/create`,
      body: { content: params.content },
    });
  }

  /**
   * 获取工作项下的所有评论列表。
   *
   * @param params - 工作项定位参数
   * @returns API 响应体，`data` 字段为评论数组
   */
  async listWorkItemComments(params: {
    url?: string;
    project_key?: string;
    work_item_type?: string;
    work_item_type_key?: string;
    work_item_id?: string;
  }) {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    return this.request({
      method: "GET",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}/comments`,
    });
  }

  /**
   * 删除工作项下的一条评论。
   *
   * @remarks
   * 仅评论的原始创建人可执行删除操作。
   *
   * @param params - 工作项定位参数 + 评论 ID
   * @param params.comment_id - 要删除的评论 ID（可通过 {@link listWorkItemComments} 获取）
   * @returns API 响应体
   * @throws 当 `comment_id` 为空时抛出异常
   */
  async deleteWorkItemComment(params: {
    url?: string;
    project_key?: string;
    work_item_type?: string;
    work_item_type_key?: string;
    work_item_id?: string;
    comment_id: string;
  }) {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (!params.comment_id) {
      throw new Error("缺少 comment_id");
    }

    return this.request({
      method: "DELETE",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}/comment/${params.comment_id}`,
    });
  }
}
