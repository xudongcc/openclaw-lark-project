# MCP 使用指南

## 连接与工具发现

通过 OpenClaw 插件 `lark-project` 已连接的飞书项目 MCP 服务执行操作。服务地址为 `https://project.feishu.cn/mcp_server/v1`，认证由 OpenClaw 的 OAuth 连接管理。

1. 查看当前会话实际提供的 MCP 工具及其说明、输入 schema。
2. 按业务语义定位工具；业务工具和五个原生工具统一使用本文列出的 `lark-project__` 完整名称。仅 `lark-project__query_all` 的 `tool_name` 参数使用 MCP 短名，如 `search_by_mql`；不要给它重复加前缀。调用时核对实际发现的名称。
3. 参数名、必填项、类型、枚举和支持能力以实时 schema 为准。参考文档中的参数表用于理解业务，不替代实时定义；不支持的参数不要传。
4. 工具不可见或连接失效时按 [auth-guard.md](auth-guard.md) 处理；不要安装外部程序、补造工具或改用未经授权的接口。

## 参数传递

直接传结构化 JSON 参数，不经过命令行或 Shell。示例中的 `name` 和 `arguments` 用来表示“调用哪个工具、传什么参数”，由宿主实际工具接口执行，无需手工向服务器发送 JSON-RPC。

```json
{
  "name": "lark-project__get_workitem_brief",
  "arguments": {
    "project_key": "<已确认的空间key>",
    "work_item_id": "<已确认的工作项ID>",
    "fields": ["name", "group_type"]
  }
}
```

- 示例中的空间、类型、字段、选项和人员均须先查询确认；占位符不能原样提交。
- 数字和布尔按 schema 传原生 JSON 数值，不把 `page_num`、`page_size`、`size` 写成字符串。
- `work_item_id` 等身份标识通常是字符串；以 schema 为准，避免大整数经过浮点数转换而失真。
- `fields`、`role_operate`、`node_schedule` 等参数按各自 schema 传数组或对象。
- **`field_value` 是独立的字符串协议**：标量直接作字符串；数组/对象先序列化为 JSON 字符串，再放进 `field_value`。不要把整个 `arguments` 或 `fields` 序列化成字符串。
- 省略未使用的可选参数；`[]`、`{}`、`null` 可能表示清空，不能当作“保持不变”的通用占位值。
- URL 不会因为传给某个 ID 参数就自动解析。先调用 `lark-project__url_decode`，按 [url-kinds.md](url-kinds.md) 识别目标并用查询结果验证。

## 工具名称参考

下表按官方源码映射列出完整工具名，帮助定位业务能力；它不是当前账号已经授权这些工具的证明。只能调用本次连接实际提供的工具。

| 业务域 | MCP 工具名称 |
|---|---|
| workitem | `lark-project__create_workitem`、`lark-project__get_workitem_brief`、`lark-project__update_field`、`lark-project__search_by_mql`、`lark-project__get_workitem_op_record`、`lark-project__list_workitem_types`、`lark-project__get_workitem_field_meta`、`lark-project__list_workitem_field_config`、`lark-project__list_workitem_role_config` |
| workflow | `lark-project__update_node`、`lark-project__transition_node`、`lark-project__transition_state`、`lark-project__get_node_detail`、`lark-project__get_transitable_states`、`lark-project__get_transition_required`、`lark-project__list_node_field_config` |
| subtask | `lark-project__update_node_subtask` |
| comment | `lark-project__add_comment`、`lark-project__list_workitem_comments` |
| relation | `lark-project__list_workitem_relations`、`lark-project__list_related_workitem` |
| workhour | `lark-project__get_workitem_man_hour_records`、`lark-project__list_schedule` |
| mywork | `lark-project__list_todo` |
| view | `lark-project__create_fixed_view`、`lark-project__get_view_detail`、`lark-project__update_fixed_view`、`lark-project__search_view_by_title`、`lark-project__list_multi_project_view_workitems` |
| chart | `lark-project__get_chart_detail`、`lark-project__list_charts` |
| team | `lark-project__list_project_team`、`lark-project__list_team_members` |
| project | `lark-project__search_project_info` |
| user | `lark-project__search_user_info` |
| attachment | `lark-project__upload_file`、`lark-project__get_download_url` |
| deliverable | `lark-project__list_deliverables` |
| resource | `lark-project__create_resource_work_item`、`lark-project__get_resource_work_item_type_conf` |
| wbs | `lark-project__list_wbs_draft_rows`、`lark-project__list_wbs_instance_rows`、`lark-project__edit_wbs_draft`、`lark-project__create_wbs_draft`、`lark-project__publish_wbs_draft`、`lark-project__reset_wbs_draft`、`lark-project__get_wbs_draft_operation_progress`、`lark-project__list_element_template` |

## 插件原生工具

这些工具由 OpenClaw 插件本地注册，与远程 MCP 共用 `lark-project__` 前缀，不是 MCP 服务端新增的接口。

| 完整工具名 | 用途 |
|---|---|
| `lark-project__url_decode` | 解析页面类别和候选业务 ID；业务操作前仍须查询验证 |
| `lark-project__attachment_upload` | 无计划时检查文件；传回 `lark-project__upload_file` 的业务计划时执行单次/分片上传 |
| `lark-project__attachment_download` | 执行 `lark-project__get_download_url` 的业务计划，校验签名并保存文件 |
| `lark-project__workitem_batch_get` | 同一空间最多 200 个字符串 ID 的只读批量查询，分别汇总成功与失败 |
| `lark-project__query_all` | MQL 会话分组、游标或页码的全量读取，逐页保留数据并标记完整性 |

附件路径位于 Gateway 所在机器；相对路径优先基于宿主 `fsPolicy.root`，否则基于会话 workspace；遵守 `workspaceOnly`，额外的 `readOnlyRoots` 只能用于上传读取，不能下载写入。沙箱会话不提供两个附件工具，不能用它们绕过沙箱。OAuth token 继续由宿主管理，原生工具只使用本次文件签名，不读取 OAuth 存储。详细调用顺序见 [attachment.md](attachment.md)。

两个查询编排工具依赖当前会话已发现工具的宿主 MCP runtime；宿主不兼容或没有该会话连接时直接报错。只读白名单、批次限制、分页完整性与续查方法见 [performance.md](performance.md)。

## 当前用户

“我负责的工作项”优先使用 `lark-project__list_todo`，或在 MQL 的合法位置使用 `current_login_user()`。需要真实身份时，对 `lark-project__search_user_info` 传 `{"user_keys":["current_login_user()"]}`，从真实结果提取唯一的当前用户 `user_key`。这种查询标记不能作为人员字段的实际 userkey；查询结果无法确认身份时停止推断。

当写入或状态查询需要实际 `user_key` 时，按 [auth-guard.md](auth-guard.md) 的身份流程解析；不要从候选名单中猜测当前操作者。

## 返回值与分页

- 检查工具错误标记和业务返回的错误码、`err_msg`、`inner_err`；HTTP 成功或文本里出现 success 不等于业务操作生效。
- 参考文档描述的是服务端业务数据。宿主可能将其包在 MCP `content` 或结构化结果中，应先读取真实业务结果，保留必要错误信息。
- 不假设宿主自动分页、解包结果或合并批次。普通查询按实际 `has_more`、`next_page_token` 或页码继续；MQL 按 `session_id` 与 `group_pagination_list` 翻页。
- 原生查询返回的 `log_id` 用于排障，失败时读取具体 `message` 与可用的 `server_code`；凭据和签名 URL 已脱敏。
- 写入后回读目标字段或状态确认；响应超时、连接中断时先查询结果，避免重复创建、评论或发布。

## 按需参考

- 调用示例：[api-examples.md](api-examples.md)
- 认证与身份：[auth-guard.md](auth-guard.md)
- 分批、分页与依赖关系：[performance.md](performance.md)
- 工具能力边界：[capabilities.md](capabilities.md)
