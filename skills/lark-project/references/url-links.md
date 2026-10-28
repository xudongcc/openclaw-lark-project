# 生成 Meegle 页面链接

## 使用边界

仅在用户明确要求链接，或链接本身是交付物时使用。普通查询、创建、更新、流转完成后不要自动追加链接。

目标是交付当前用户可打开的 canonical 页面链接：

1. 按 [Auth Guard](auth-guard.md) 固定当前 MCP 连接身份与站点，再确认目标对象可查询；同一轮只复用相同连接与相同 host 的成功结果。

2. 只使用本文列出的路径模板，不根据印象发明路由。
3. 生成后必须调用 `lark-project__url_decode` 反向校验；返回的 `url_kind` 与目标类型不同或为 `unknown` 时，不得交付该链接。

反向解析只证明链接结构正确。目标查询成功才是“当前身份可访问”的证据；它不保证其他用户也有权限。

---

## 参数来源

### host

本插件默认连接 `https://project.feishu.cn/mcp_server/v1`。只使用当前已验证的 MCP 环境对应页面 host；不能根据用户输入切换连接或改用任意域名。用户已有链接的 host 由 `lark-project__url_decode` 获取，并按 [auth-guard.md](auth-guard.md) 核对环境。

域名比较忽略大小写和末尾的点，端口必须对应同一站点。不同环境之间不能复用查询成功结论；无法确认当前连接环境时先确认连接，不猜 host。最终链接统一 HTTPS，只包含该站点的域名与可选端口。

### simple_name

`simple_name` 与 `project_key` 不是同一个概念，禁止互换。使用 `lark-project__search_project_info` 的唯一空间结果作为权威来源：

- 已有 URL 的 `simple_name` 只能作为空间查询输入；只有该 URL 本身指向同一目标对象/视图，或查询结果证明它与目标对象的 `project_key` 属于同一空间时，才能复用；
- 只有空间名称或 project_key：查询后使用唯一命中结果中的 `simple_name`；
- 结果不唯一或没有返回 `simple_name`：询问用户提供准确空间或现有页面链接，不要拿 `project_key` 代替。

### 其他动态字段

ID 与类型 key 优先取自本轮已有工具结果；否则先用对应查询工具确认：

| 目标 | 可访问性检查 |
|---|---|
| 工作项详情 | `lark-project__get_workitem_brief` |
| 需求、缺陷、通用、空间概览、甘特、图表视图 | `lark-project__get_view_detail` |
| 跨空间 / 全景视图 `view_multi_project` | `lark-project__list_multi_project_view_workitems` |
| 图表详情 | `lark-project__get_chart_detail` |
| 空间首页 / 空间概览 | `lark-project__search_project_info` |

工作项类型、视图 ID、图表 ID 或工作项 ID 缺失时合并为一次询问。查询返回无权限、不存在或不唯一时停止，不生成“可访问”链接。

视图查询成功只能证明该 `view_id` 可读取，不能单独推断页面路由类型。`url_kind` 必须来自指向同一视图的已有 URL 经 `lark-project__url_decode` 的结果，或查询结果中的权威 view scope；用户口述的视图类型只能用于缩小查询范围，不能单独作为路由证据。无法确认时询问用户。特别是“全景视图”必须确认是 `view_multi_project` 还是 `view_project_overview`。

---

## 支持的 canonical 路径

每个 `{...}` 仅表示一个路径段。动态值按 RFC 3986 path segment 编码：只保留字母、数字、`-`、`.`、`_`、`~`，其余字节全部百分号编码；拒绝原始值中包含 `/`、`\\`、`?`、`#`、控制字符，或整个值为 `.` / `..` 的歧义输入。

| url_kind | 必需字段 | pathname |
|---|---|---|
| `workitem_detail` | simple_name, work_item_type, work_item_id | `/{simple_name}/{work_item_type}/detail/{work_item_id}` |
| `view_story` | simple_name, view_id | `/{simple_name}/storyView/{view_id}` |
| `view_issue` | simple_name, view_id | `/{simple_name}/issueView/{view_id}` |
| `view_workitem` | simple_name, work_item_type, view_id | `/{simple_name}/workObjectView/{work_item_type}/{view_id}` |
| `view_multi_project` | simple_name, view_id | `/{simple_name}/multiProjectView/{view_id}` |
| `view_project_overview` | simple_name, view_id | `/{simple_name}/project-overview/{view_id}` |
| `view_user_gantt` | simple_name, view_id | `/{simple_name}/userGantt/{view_id}` |
| `view_chart` | simple_name, view_id | `/{simple_name}/workObjectView/chart/{view_id}` |
| `chart_detail` | simple_name, chart_id | `/{simple_name}/chart/detail/{chart_id}` |
| `project_home` | simple_name | `/{simple_name}` |
| `project_overview` | simple_name | `/{simple_name}/overview` |

资源工作项或资源视图把 `work_item_type` 包装为 `_{work_item_type}_resource`，例如 `story` → `_story_resource`。不要重复包装已经带该形式的值。

`work_item_type=chart` 的工作项详情会与 `chart_detail` 冲突；通用视图中的 `work_item_type=chart` 会与 `view_chart` 冲突。反向校验会暴露这类保留路由冲突，遇到时停止并说明当前 canonical 路由无法无歧义表达目标。

不支持系统页、设置页、登录页、导入页、错误页、插件页，以及任何本文未列出的 `url_kind`。

---

## 生成与校验

每个候选链接都必须校验完整目标身份，不能只比较 `url_kind`：

- 所有类型：decoder 返回的 `host` 按 Auth Guard 的规则规范化后必须等于当前已验证连接的 host，`simple_name` 必须等于权威空间结果；
- `workitem_detail`：`work_item_type`、`work_item_id` 必须与目标一致；资源工作项还必须返回 `is_resource=true`；
- `view_workitem`：`work_item_type`、`view_id` 必须与目标一致；资源视图还必须返回 `is_resource=true`；
- 其他 `view_*`：`view_id` 必须与目标一致；
- `chart_detail`：`chart_id` 必须与目标一致；
- `project_home` / `project_overview`：除公共字段外没有额外 ID。

任一字段缺失或不一致都停止交付。动态路径段比较解码后的语义值，不比较百分号编码文本本身。

### 工作项详情

已知：host=`project.feishu.cn`、simple_name=`xopenapp`、work_item_type=`story`、work_item_id=`7092625364`。

候选链接：

```text
https://project.feishu.cn/xopenapp/story/detail/7092625364
```

校验：

```json
{
  "name": "lark-project__url_decode",
  "arguments": {
    "url": "https://project.feishu.cn/xopenapp/story/detail/7092625364"
  }
}
```

只在输出 `url_kind=workitem_detail` 且关键字段与输入一致时交付。

### 通用工作项视图

```text
https://project.feishu.cn/xopenapp/workObjectView/story/9988
```

必须解码为 `view_workitem`，并返回一致的 `simple_name`、`work_item_type` 和 `view_id`。

### 跨空间 / 全景视图

```text
https://project.feishu.cn/xopenapp/multiProjectView/9988
https://project.feishu.cn/xopenapp/project-overview/9988
```

分别必须解码为 `view_multi_project` 和 `view_project_overview`。不要只凭“全景视图”名称猜一种；根据视图查询结果或已有 URL 确定类型，无法区分时询问用户。

---

## 交付格式与失败处理

成功时优先用固定的“类型 + ID”作 Markdown label，例如：

```markdown
[需求 7092625364](https://project.feishu.cn/xopenapp/story/detail/7092625364)
```

若必须使用查询结果中的名称作为 label，先转义 `\\`、`[`、`]`、`(`、`)` 等 Markdown 元字符，避免不可信名称改变链接结构。

失败时：

- host 缺失：先确认当前 MCP 连接环境；
- `simple_name` 缺失/不唯一：请用户确认空间，禁止用 `project_key` 替代；
- 目标不存在或无权限：说明当前身份无法验证可访问性，不返回伪链接；
- decoder 返回 `unknown` 或另一 `url_kind`：报告路由冲突或模板不支持，不返回候选链接；
- `lark-project__url_decode` 不可用或解析失败：说明工具或输入问题；不要绕过校验后手拼交付。

以上均为确定性失败；输入与环境没有变化时不要原样重试。
