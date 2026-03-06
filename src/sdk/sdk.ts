import type {
  LarkProjectOptions,
  WorkItemLocator,
  CreateWorkItemCommentParams,
  ListWorkItemCommentsParams,
  DeleteWorkItemCommentParams,
  UpdateWorkItemFieldParams,
  UpdateWorkItemRoleOwnersParams,
  ListBusinessesParams,
  GetWorkItemWorkflowParams,
  ConfirmNodeParams,
  RollbackNodeParams,
  ChangeStateParams,
  CreateWorkItemParams,
  AbortWorkItemParams,
  CreateWorkItemCommentResult,
  ListWorkItemCommentsResult,
  DeleteWorkItemCommentResult,
  UpdateWorkItemFieldResult,
  UpdateWorkItemRoleOwnersResult,
  ListBusinessesResult,
  GetWorkItemWorkflowResult,
  ConfirmNodeResult,
  RollbackNodeResult,
  ChangeStateResult,
  CreateWorkItemResult,
  AbortWorkItemResult,
  LarkProjectResponse,
} from "./types";

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
  private async request<T = unknown>(options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    query?: Record<string, string | number | undefined>;
    body?: any;
  }): Promise<LarkProjectResponse<T>> {
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

    const code = json?.err_code ?? json?.code;
    if (typeof code === "number" && code !== 0) {
      throw new Error(
        `OpenAPI ${options.method} ${options.path} business failed: code=${code}; msg=${json?.err_msg || json?.msg || "unknown"}`,
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
  private resolveWorkItem(params: WorkItemLocator) {
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

   * 在工作项下添加一条纯文本评论。
   *
   * @param params - 工作项定位参数 + 评论内容
   * @param params.content - 评论内容（纯文本）
   * @returns API 响应体，`data` 字段为新评论 ID
   * @throws 当 `content` 为空时抛出异常
   */
  async createWorkItemComment(
    params: CreateWorkItemCommentParams,
  ): Promise<CreateWorkItemCommentResult> {
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
  async listWorkItemComments(
    params: ListWorkItemCommentsParams,
  ): Promise<ListWorkItemCommentsResult> {
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
  async deleteWorkItemComment(
    params: DeleteWorkItemCommentParams,
  ): Promise<DeleteWorkItemCommentResult> {
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

  /**
   * 更新工作项的任意字段（通用方法）。
   *
   * @remarks
   * 通过「更新工作项」API 实现，可用于更新 MCP `update_field` 不支持的字段
   * （如 `business` 业务线、`description` 描述等）。
   *
   * @param params - 工作项定位参数 + 要更新的字段列表
   * @param params.update_fields - 字段数组，每项包含 `field_key` 和 `field_value`
   * @returns API 响应体
   * @throws 当 `update_fields` 为空时抛出异常
   */
  async updateWorkItemField(
    params: UpdateWorkItemFieldParams,
  ): Promise<UpdateWorkItemFieldResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (
      !Array.isArray(params.update_fields) ||
      params.update_fields.length === 0
    ) {
      throw new Error("update_fields 不能为空");
    }

    return this.request({
      method: "PUT",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}`,
      body: {
        update_fields: params.update_fields,
      },
    });
  }

  /**
   * 修改工作项的角色人员（覆盖更新）。
   *
   * @remarks
   * 通过「更新工作项」API 的 `role_owners` 字段实现。
   * **注意：这是覆盖更新**，调用时需传入所有角色及其人员，未传入的角色人员会被清空。
   *
   * @param params - 工作项定位参数 + 角色人员列表
   * @param params.role_owners - 角色人员数组，每项包含 `role`（角色 ID）和 `owners`（user_key 列表）
   * @returns API 响应体
   * @throws 当 `role_owners` 为空时抛出异常
   */
  async updateWorkItemRoleOwners(
    params: UpdateWorkItemRoleOwnersParams,
  ): Promise<UpdateWorkItemRoleOwnersResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (!Array.isArray(params.role_owners) || params.role_owners.length === 0) {
      throw new Error("role_owners 不能为空");
    }

    return this.request({
      method: "PUT",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}`,
      body: {
        update_fields: [
          {
            field_key: "role_owners",
            field_value: params.role_owners,
          },
        ],
      },
    });
  }

  /**
   * 获取空间下的业务线列表。
   *
   * @remarks
   * 用于更新业务线字段时查找正确的业务线 ID。
   * 业务线字段 `field_value` 必须传业务线 ID，而不是名称。
   *
   * @param params - 包含 project_key 的参数
   * @returns API 响应体，`data` 字段为业务线数组
   */
  async listBusinesses(
    params: ListBusinessesParams,
  ): Promise<ListBusinessesResult> {
    if (!params.project_key) {
      throw new Error("缺少 project_key");
    }

    return this.request({
      method: "GET",
      path: `/open_api/${params.project_key}/business/all`,
    });
  }

  /**
   * 获取工作项的工作流详情。
   *
   * @remarks
   * 返回节点列表、当前节点状态、负责人、排期等信息。
   * 用于流转前获取 `node_id` / `state_key`。
   *
   * @param params - 工作项定位参数
   * @returns API 响应体，包含工作流节点信息
   */
  async getWorkItemWorkflow(
    params: GetWorkItemWorkflowParams,
  ): Promise<GetWorkItemWorkflowResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    // 先尝试节点流 /workflow/query (flow_type 默认 0)
    try {
      return await this.request({
        method: "POST",
        path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}/workflow/query`,
      });
    } catch (err: any) {
      // 状态流会返回 20026 FlowType Is Error
      const isStateFlow = err?.message?.includes("20026");
      if (!isStateFlow) throw err;
    }

    // 状态流：flow_type=1
    return this.request({
      method: "POST",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}/workflow/query`,
      body: { flow_type: 1 },
    });
  }

  /**
   * 完成节点（节点流）。
   *
   * @remarks
   * 将状态为「已到达」（status=2）的节点标记为完成。
   * 可同时更新节点负责人、排期和表单字段。
   *
   * @param params - 工作项定位参数 + 节点参数
   * @param params.node_id - 目标节点 ID (state_key)
   * @returns API 响应体
   * @throws 当缺少 node_id 时抛出异常
   */
  async confirmNode(params: ConfirmNodeParams): Promise<ConfirmNodeResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (!params.node_id) {
      throw new Error("缺少 node_id");
    }

    const body: Record<string, unknown> = { action: "confirm" };
    if (params.node_owners) body.node_owners = params.node_owners;
    if (params.node_schedule) body.node_schedule = params.node_schedule;
    if (params.fields) body.fields = params.fields;
    if (params.role_assignee) body.role_assignee = params.role_assignee;

    return this.request({
      method: "POST",
      path: `/open_api/${projectKey}/workflow/${workItemTypeKey}/${workItemId}/node/${params.node_id}/operate`,
      body,
    });
  }

  /**
   * 回滚节点（节点流）。
   *
   * @remarks
   * 将已完成的节点回滚到「已到达」状态。
   *
   * @param params - 工作项定位参数 + 节点参数
   * @param params.node_id - 目标节点 ID (state_key)
   * @param params.rollback_reason - 回滚原因（必填）
   * @returns API 响应体
   * @throws 当缺少 node_id 或 rollback_reason 时抛出异常
   */
  async rollbackNode(params: RollbackNodeParams): Promise<RollbackNodeResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (!params.node_id) {
      throw new Error("缺少 node_id");
    }
    if (!params.rollback_reason) {
      throw new Error("缺少 rollback_reason");
    }

    return this.request({
      method: "POST",
      path: `/open_api/${projectKey}/workflow/${workItemTypeKey}/${workItemId}/node/${params.node_id}/operate`,
      body: {
        action: "rollback",
        rollback_reason: params.rollback_reason,
      },
    });
  }

  /**
   * 状态流转（状态流）。
   *
   * @remarks
   * 用于将工作项实例流转到指定状态。
   * 可同时更新表单字段和角色人员。
   *
   * @param params - 工作项定位参数 + 状态流转参数
   * @param params.transition_id - 流转 ID，可通过获取工作流详情获取
   * @returns API 响应体
   * @throws 当缺少 transition_id 时抛出异常
   */
  async changeState(params: ChangeStateParams): Promise<ChangeStateResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    if (!params.transition_id) {
      throw new Error("缺少 transition_id");
    }

    const body: Record<string, unknown> = {
      transition_id: Number(params.transition_id),
    };
    if (params.fields) body.fields = params.fields;
    if (params.role_owners) body.role_owners = params.role_owners;

    return this.request({
      method: "POST",
      path: `/open_api/${projectKey}/workflow/${workItemTypeKey}/${workItemId}/node/state_change`,
      body,
    });
  }

  /**
   * 创建工作项实例。
   *
   * @remarks
   * 在指定空间和工作项类型下新增一个实例。支持从 fields 提取 name，兼容 MCP 工具定义。
   *
   * @param params - 创建参数
   * @returns API 响应体，成功时 data 为新工作项 ID
   */
  async createWorkItem(
    params: CreateWorkItemParams,
  ): Promise<CreateWorkItemResult> {
    const parsed = parseWorkItemUrl(params.url);
    const projectKey = params.project_key || parsed.project_key;
    const workItemTypeKey =
      params.work_item_type ||
      params.work_item_type_key ||
      parsed.work_item_type;

    if (!projectKey) {
      throw new Error("缺少 project_key");
    }
    if (!workItemTypeKey) {
      throw new Error("缺少 work_item_type_key");
    }

    let name = params.name;
    const fields = params.field_value_pairs || [];

    if (!name) {
      const nameField = fields.find((f: any) => f.field_key === "name");
      if (nameField && typeof nameField.field_value === "string") {
        name = nameField.field_value;
      }
    }

    if (!name) {
      throw new Error("缺少 name");
    }

    const body: Record<string, unknown> = {
      work_item_type_key: workItemTypeKey,
      name,
    };

    const validFields = fields.filter((f: any) => f.field_key !== "name");
    if (validFields.length > 0) {
      body.field_value_pairs = validFields.map((f: any) => ({
        field_key: f.field_key,
        field_value: f.field_value,
        field_type_key: f.field_type_key,
      }));
    }

    if (params.template_id) {
      body.template_id = params.template_id;
    }

    return this.request({
      method: "POST",
      path: `/open_api/${projectKey}/work_item/create`,
      body,
    });
  }

  /**
   * 删除（终止）工作项实例。
   *
   * @remarks
   * 飞书项目不提供真正的删除 API，使用终止（abort）代替。
   * 终止后可通过 is_aborted=false 恢复。
   *
   * @param params - 工作项定位参数
   * @param params.is_aborted - true 终止，false 恢复（默认 true）
   * @param params.reason - 终止/恢复原因
   * @returns API 响应体
   */
  async abortWorkItem(
    params: AbortWorkItemParams,
  ): Promise<AbortWorkItemResult> {
    const { projectKey, workItemTypeKey, workItemId } =
      this.resolveWorkItem(params);

    return this.request({
      method: "PUT",
      path: `/open_api/${projectKey}/work_item/${workItemTypeKey}/${workItemId}/abort`,
      body: {
        is_aborted: params.is_aborted !== false,
        reason: params.reason || "API 终止",
        reason_option: "other",
      },
    });
  }
}
