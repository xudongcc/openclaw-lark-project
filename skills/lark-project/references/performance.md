# 性能与并发调用指南

本文件收录减少延迟的工程性规则。核心协议（字段格式、错误自愈）仍在 SKILL.md 主文件中。

## 并行调用

无依赖的工具调用应并行发起，有依赖则必须串行。

**必须串行**（前者输出是后者输入）：
- `lark-project__search_project_info` → `lark-project__list_workitem_field_config` → `lark-project__search_by_mql`
- `lark-project__get_workitem_brief` → `lark-project__transition_node` / `lark-project__update_field`
- `lark-project__list_workitem_field_config` → `lark-project__create_workitem`

**可并行**：
- `lark-project__list_workitem_field_config` 和 `lark-project__list_workitem_role_config`（同类型）
- 多种工作项类型的 `lark-project__list_workitem_field_config`（如 story + issue）
- 各条件的 count 查询、多人排期分批查询

## 大结果处理

- **分批查询**：`lark-project__list_schedule` 多人时拆成每批 ≤ 20 人并行
- **精简 SELECT**：只选必要字段，避免富文本等大体积字段
- **按需翻页**：先读首页取 `list[0].count`；`lark-project__search_by_mql` 要全量时用 `session_id` + `group_pagination_list` 逐页取（SKILL.md「翻页取全量」），不要用 `LIMIT offset, n`

- **全量入口**：优先用 `lark-project__query_all`，检查 `summary.complete`；它返回逐页数据，不是 CLI 扁平合并结果。
- **写入结果未知**：先回读确认，不重复创建、评论或发布。

## 原生批量读取

`lark-project__workitem_batch_get` 对 `lark-project__get_workitem_brief` 做只读编排，按官方批量读取规则执行。同一次调用只能查询同一空间，最多 200 个 ID；ID 必须是正十进制字符串，不能转换成 JavaScript 数字。工具规范化前导零并去重，成功项与失败项分别保持原输入顺序。

```json
{
  "name": "lark-project__workitem_batch_get",
  "arguments": {
    "project_key": "<已确认空间key>",
    "work_item_ids": ["123456", "123457"],
    "fields": ["name", "group_type"]
  }
}
```

- 返回 `results=[{work_item_id,data}]`、`errors=[{work_item_id,code,message}]` 与 `summary`；有追踪信息时保留 `log_id`，错误另含可用的 `server_code`。不能把部分成功说成全部成功。
- 最多 3 个读取并发；宿主未将该 MCP 连接标记为支持并发时串行。
- 单个无权限/不存在的 ID 记录错误，其他 ID 继续；401、OAuth 认证失效、会话更换或工具调用权限失效终止整个批次，不把未执行项填成成功。MCP 错误可包含多段文本；认证信息即使在后续文本中也必须停止，重新连接后再读。
- 每个 ID 仅一次读取，不自动展开 `fields=["_all"]` 的全部字段页。不要把一个工作项的字段 token 复用给其他工作项。

## 原生全量分页

`lark-project__query_all` 的 `tool_name` 使用官方 MCP 短名，默认 `search_by_mql`；`arguments` 是该工具的首查参数。只允许 schema 中列明的只读工具，不能调用写入、附件签名或任意工具名。

```json
{
  "name": "lark-project__query_all",
  "arguments": {
    "arguments": {
      "project_key": "<已确认空间key>",
      "mql": "SELECT `work_item_id`, `name` FROM `<已确认空间key>`.`story` WHERE `archiving_date` IS NULL"
    },
    "max_pages": 200
  }
}
```

单个工作项的全部逻辑字段：

```json
{
  "name": "lark-project__query_all",
  "arguments": {
    "tool_name": "get_workitem_brief",
    "arguments": {
      "project_key": "<已确认空间key>",
      "work_item_id": "123456",
      "fields": ["_all"],
      "page_size": 100
    }
  }
}
```

执行协议：

1. 首查从第一页开始，不传非空 `page_token` / `next_page_token` 或大于 1 的 `page_num` / `page_no`。MQL 只传 `project_key` + `mql`，不混入 `session_id` 或 `group_pagination_list`。
2. MQL 从首查保留 `session_id`，用各组 `count`、`group_id` 按每页 50 条取后续页；后续请求不再发送 MQL。单组无 `group_infos` 时使用官方无分组 ID `"1"`。不能确定各组数量时保留首查并返回不完整，不猜分组计数。首页应包含各组 `min(count,50)` 条之和；后续每页应包含该组剩余数量与 50 的较小值。逐页核对，少/多返回数据或无法识别结果行结构时立即停止，分别标记 `row_count_mismatch` / `unverified_row_count`。最终还须核对实际总行数，不能宣称未经验证的全量。
3. 其他工具根据当前 MCP 输入 schema 选择 `next_page_token` / `page_token`，或在 `has_more=true` 时使用 schema 声明的 `page_num` / `page_no`；WBS 使用 `page_no`。待办 `list_todo` 未返回分页标记时读取到空页，即使上一页不足 50 条也继续。其他分页接口缺少结束标记时返回 `missing_pagination_metadata`，不默认认为已结束。
4. 返回 `pages=[{arguments,data}]`，保留每页完整业务数据、分组边界和可用的 `log_id`。跨页汇总应读取所有 `pages[].data`，不能只读取第一页或把元数据数组误当工作项行。工具不会猜测业务数组结构再扁平化。
5. `max_pages` 默认并且最多为 200（包括首查），总结果约 8 MiB 后停止追加后续页；单次编排限时 10 分钟。重复游标、已确认的重复对象 ID、连续空页等情况也会停止。
6. 只有 `summary.complete=true` 才能交付为本次查询全量结果。否则说明 `stopped_reason`，保留已取得的 `pages`，按下列续查协议处理；不要把分页参数传回只接受首查的 `query_all`。

### 续查与合并

有 `continuation` 时，使用其 `tool_name` 对应的 `lark-project__` 官方 MCP 工具，并原样传入 `arguments`。`page_index` 是本次返回的 **`pages` 数组零基索引**，不是服务端页码；不同 MQL 组会重复使用相同页码。

| `continuation.merge_mode` | 合并动作 |
|---|---|
| `append` | 该请求尚未返回有效页；`page_index=pages.length`。成功后追加完整页记录。 |
| `replace` | 该请求对应的异常页已在 `pages` 中。重试成功后替换 `pages[page_index]` 的完整记录（`arguments`、`data`、可用 `log_id`），不能追加。 |

例如已有 50 条首页和 5 条异常末页，重试末页得到 10 条，应替换原来的 5 条，合计 60 条；不能合并成 65 条，也不能按整行内容去重，因为不同工作项可能有相同的投影字段值。

替换/追加成功不代表恢复流程结束，也不能直接将原来的 `summary.complete` 改为 `true`。仍须核对该页数量、继续剩余组/页、检查游标是否前进，并重新计算总数。重复游标或异常页仍未恢复时停止，不循环重试。MQL 续查沿用原 session，不重发 MQL。

没有 `continuation` 时不要猜测“重试最后一页”。首页异常或只能确认总数不符时，无法定位可安全重试的页；报告不完整，核对查询和返回结构后再重新查询。新 MQL 首查会创建新 session，须重新收集结果，不能与旧 session 的页拼接。

分页完整只表示响应分页链路已走完，不代表业务筛选、字段选择或时间范围正确；仍须验证查询语义。相同的字段值可以合法出现在多页，工具不会因整页内容相同而丢弃数据；有明确对象 ID 时按 ID 检查重复。可验证时返回 `received_items`，并与 `expected_total` 核对。

## 宿主连接与兼容性

两个编排工具只复用**当前会话已建立且已发现工具的 OpenClaw MCP runtime**；使用公开 SDK 校验实时输入 schema，遵守 MCP 连接的 include/exclude、会话禁用和仅应用可见标记。每次请求检查会话及请求者归属，并在宿主最终发送前再次检查调用是否有效。它们不会另起 MCP 服务、读取 OAuth 凭据、运行 CLI 或建立额外登录流程。

OpenClaw 当前没有公开的 MCP 调用 SDK，本插件将对已发布的 `agents/agent-bundle-mcp-manager-api.js` 的兼容适配集中在一个模块中。宿主版本不兼容、当前会话未完成工具发现、或其他运行方式未提供该会话 runtime 时，明确报错并改用已有官方 MCP 工具完成任务；不能声称原生编排已经执行。

取消会停止等待和后续调度；已由宿主发出的只读请求可能继续到宿主超时，不销毁其他工具共用的连接。
