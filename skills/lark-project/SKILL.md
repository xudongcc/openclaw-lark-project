---
name: lark-project
description: |
  通过 OpenClaw 的飞书项目 MCP 查询和管理 Meego/Meegle 工作项、需求、缺陷、任务、字段、角色、评论、节点与状态流转、视图、待办、排期和 WBS，并协助完成连接授权。用户提到飞书项目、project.feishu.cn 链接、MQL、团队排期、项目工作流或飞书项目 OAuth 登录时使用。本技能面向飞书项目，不用于普通飞书云文档、聊天或日历。
license: MIT
---

# 飞书项目操作指南

通过 OpenClaw 插件 `lark-project` 连接的官方 MCP 服务操作飞书项目数据。直接调用官方 MCP 业务工具，以及插件提供的 URL 解析、附件传输、批量读取和全量分页工具。用户要求协助连接或 Web UI 授权失败时，按认证参考文档使用 OpenClaw 自带 CLI 完成授权。输出语言跟随用户，默认中文。

保留官方技能按业务域与 SOP 分层的结构，按需读取参考文件：

- **连接、Agent 协助 OAuth 与身份**：[references/auth-guard.md](references/auth-guard.md)；首次连接、授权失效或 Web UI 登录失败时读取。
- **工具发现与 JSON 参数**：[references/mcp-guide.md](references/mcp-guide.md)
- **调用示例**：[references/api-examples.md](references/api-examples.md)
- **来源与许可证**：[UPSTREAM.md](UPSTREAM.md)

先查看当前连接实际可用的工具及输入 schema。下文所有可调用工具统一使用 `lark-project__` 完整前缀，业务参数名使用 snake_case；实际可用性和参数以当前会话 schema 为准。原生编排的 `tool_name` 参数仍传官方短名，不加前缀。参考文档不是当前账号的授权清单。

写入前确认用户的目标和所需业务值；已有明确授权时直接执行。空间、人员、模板或目标状态不唯一，或缺少必填业务值时，合并询问，不猜测。写入后回读确认；发生写入超时时先查询实际结果，不盲目重复提交。

---

## Project 空间域

### lark-project__search_project_info
搜索空间信息，将空间名转换为 project_key 或验证空间是否存在；省略 project_key 时返回当前用户最近访问过的空间列表（按访问时间由近及远）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 否 | 空间 projectKey、simpleName 或空间名称；留空查询当前用户可访问的空间 |
| page_num | number | 否 | 分页页码，每页 50 条，从 1 开始 |

---

## WorkItem 工作项域

> 元数据查询工具（`lark-project__list_workitem_types` / `lark-project__list_workitem_field_config` / `lark-project__list_workitem_role_config` / `lark-project__get_workitem_field_meta`）的参数表见 [references/workitem.md](references/workitem.md)。

### lark-project__create_workitem
创建工作项实例。**务必先用 `lark-project__list_workitem_field_config` 获取字段信息，`lark-project__list_workitem_role_config` 获取角色信息。模板 ID 是必填项。**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_type | string | 是 | 工作项类型 |
| project_key | string | 否 | 空间标识 |
| fields | array | 否 | 字段值列表，每项含 field_key 和 field_value |

### lark-project__get_workitem_brief
按 ID/名称查询工作项概况。不传 fields 时返回固定基础字段加上一组默认系统字段：`group_type`（拉群方式）、`description`、`current_status_operator`、`watchers`（value 为 null 时也会出现）；其余字段需先通过 `lark-project__list_workitem_field_config` 拿到 key 再传入 fields。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 否 | 工作项 ID（与 `name` 二选一） |
| name | string | 否 | 按名称查询工作项（与 `work_item_id` 二选一） |
| project_key | string | 否 | 空间 key |
| fields | array | 否 | 要查询的 field_key 或 field_name；传 `["_all"]` 时按逻辑字段分页返回全部字段；传 `["group_type"]` 时只取拉群方式 |
| page_size | number | 否 | 仅 `fields=["_all"]` 时生效；每页字段数量，默认 100，最大 200。直接传 JSON 数字，例如 `"page_size": 100` |
| page_token | string | 否 | 仅 `fields=["_all"]` 时生效；翻页 token，首次不传，下一页传上一页响应的 `next_page_token`（token 形如字段 key，例如 `"business"`）；直接传 JSON 字符串，不要把它当成页码 |

> **逻辑字段聚合（重要心智模型）**：服务端把 `group_id` / `chat_group` 这类"拉群"相关的物理字段**合并**到一个逻辑字段 `group_type`。读取/更新统一走 `group_type`，**不要再单独读取 `group_id` 或 `chat_group`**。
>
> ⚠️ **读写协议不对称**：读返回结构里**判别键是 `value`**（不是 `type`），更新时**判别键是 `type`**——禁止照着读到的结构直接回写。
>
> 读返回（`workitem_fields[].value` 字段）的形状：
> - `auto` → `{value: "auto", label: "自动拉群", group_id: "oc_xxx"}`（自动拉群附带 group_id；状态切换时 oc_id 可能会变）
> - `bind` → `{value: "bind", label: "绑定现有群", group_id: "oc_xxx"}`
> - `disabled` → `{value: "disabled", label: "不拉群"}`（无 group_id）
>
> 写协议（`field_value` 里的 JSON）：`{"type": "auto" | "bind" | "disabled", "group_id": "oc_xxx"}`

### 批量查询工作项

使用 `lark-project__workitem_batch_get`，传同一空间的 `project_key`、1–200 个字符串 `work_item_ids`，以及已确认的 `fields`。工具去重并保留顺序，最多 3 并发（宿主未开启并行时串行），分别返回 `results`、`errors`、`summary`；认证、会话或工具调用权限失效，以及取消时停止。每个 ID 只读取一页，`fields=["_all"]` 的字段翻页仍须看各自返回的 token，或对单个 ID 使用 `lark-project__query_all`。见 [references/performance.md](references/performance.md)。

### lark-project__update_field
修改指定实例的字段值或角色。节点字段更新须用 `lark-project__update_node`。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID 或名称 |
| project_key | string | 否 | 空间 key |
| fields | array | 否 | 要更新的字段列表，每项含 field_key 和 field_value |
| role_operate | array | 否 | 角色操作，每项含 op(add/remove)、role_key、user_keys |

**角色更新**：不能通过 fields 更新角色，必须用 `role_operate`。role_key 通过 `lark-project__list_workitem_role_config` 获取，user_keys 通过 `lark-project__search_user_info` 获取。

**拉群方式更新（`group_type` 逻辑字段）**：要修改/读取拉群方式统一走 `group_type`，不要再单独操作 `group_id` / `chat_group`。写协议 `field_value` 形如：`{"type": "auto" | "bind" | "disabled", "group_id": "oc_xxx"}`（注意写用 `type` 作为判别键，**与读返回的 `value` 不对称**）。校验规则（服务端实际报错文本）：`bind` 不带 `group_id` 或带空串/纯空格 → `group_id is required when group_type=bind`；`auto`/`disabled` 同时带 `group_id` → `group_type conflicts with group_id: type=<auto|disabled>`。详细示例见 [references/sop-update-workitem.md](references/sop-update-workitem.md)。

### lark-project__search_by_mql
使用 MQL 查询工作项数据。语法按主题拆在 6 个文件：基础与硬规则 [references/mql-basics.md](references/mql-basics.md)、运算符与数组函数 [references/mql-operators.md](references/mql-operators.md)、时间与状态 [references/mql-time-status.md](references/mql-time-status.md)、人员与角色 [references/mql-people-roles.md](references/mql-people-roles.md)、节点与关联 [references/mql-nodes-relations.md](references/mql-nodes-relations.md)、整句示例与关键词映射 [references/mql-examples.md](references/mql-examples.md)。写 MQL 前至少读 basics 与 operators。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间标识（支持名称、simpleName、projectKey） |
| mql | string | 首查必填 | MQL 查询语句（完整 SQL）。单次最多返回 50 条；`LIMIT n` 只用于截断（n ≤ 50），不用于翻页 |
| session_id | string | 翻页必填 | 翻页用。取自首查返回体的 `session_id`；翻页时只传 `project_key` + `session_id` + `group_pagination_list`，不要再传 `mql`，否则按新查询重新执行、翻页参数被忽略 |
| group_pagination_list | array | 翻页必填 | 翻页参数，与 `session_id` 配合使用，首查不传。每页 50 条，总页数 = ceil(`list[0].count` / 50)；目前只支持传入一组 `[{"group_id":"<分组ID>","page_num":N}]` |

**翻页取全量**：优先使用 `lark-project__query_all`，传 `arguments={"project_key":"已确认空间key","mql":"已验证MQL"}`。它保留所有 `pages[].data`；只有 `summary.complete=true` 才能称为全量。失败或截断时按 `continuation.merge_mode` 追加或替换零基 `page_index` 指定的页，再核对剩余页和总数；没有续查信息时不要猜测重试页。详见 [references/performance.md](references/performance.md)。

直接调用官方 MCP 时使用下列协议，不要用 `LIMIT offset, n` 翻页：
1. 首查只传 `project_key` + `mql`，返回第 1 页（最多 50 条）。
   从返回体取 `session_id`、`list[0].count`、`list[0].group_infos[].group_id`；无分组查询的 `group_id` 为 `"1"`。
2. 之后每页传 `project_key` + `session_id` + `group_pagination_list '[{"group_id":"<分组ID>","page_num":N}]'`，不传 `mql`。
   `page_num` 从 2 取到 ceil(count/50)；第 1 页已由首查返回。
3. 翻页响应里 `list` / `session_id` 为 null，总数只能从第 1 页拿；`session_id` 与非空 MQL 同传会重新执行 MQL、回到第 1 页。

**要点**：
- 先用 `lark-project__list_workitem_field_config` / `lark-project__list_workitem_role_config` 获取字段与角色配置；查不到直接报错不要继续
- SELECT 后属性不宜过多，**优先使用字段 key**（如 `name`、`priority`、`status`）；单次最多 50 条，需全量时按上面「翻页取全量」用 `session_id` + `group_pagination_list` 逐页取

### lark-project__get_workitem_op_record
查看工作项操作记录。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_id | string | 是 | 工作项 ID |

---

## Attachment 附件域

附件必须完成“对象存储上传 → 绑定指定评论或字段 → 回读同一目标验收”。先确定 `resource_type`：评论附件/图片 `13/14` 不查附件字段、不传 `field_key`，发布后回读评论；附件字段 `15` 才消歧 `file/multi-file` 字段；富文本图片 `16` 验证目标富文本字段并保留已有内容。按 [references/attachment.md](references/attachment.md) 对应分支执行。原生 `lark-project__attachment_upload` 先检查文件，再执行 MCP `lark-project__upload_file` 返回的签名计划；下载用 `lark-project__attachment_download` 执行 MCP `lark-project__get_download_url` 的计划。路径属于 Gateway 机器；附件工具不在沙箱中提供。
---

## WorkFlow 工作流域

> 流转辅助工具（`lark-project__get_transitable_states` / `lark-project__get_transition_required` / `lark-project__list_node_field_config`）的参数表见 [references/workflow.md](references/workflow.md)。

### lark-project__transition_node
仅用于节点流工作项，操作节点完成流转或回滚。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID |
| action | string | 否 | confirm（流转） / rollback（回滚） |
| node_id | string | 否 | 节点 ID |
| rollback_reason | string | 否 | 回滚原因，action=rollback 时需填写 |
| project_key | string | 否 | 空间 key |

### lark-project__transition_state
仅用于状态流工作项，流转工作项状态。先用 `lark-project__get_transitable_states` 获取可流转状态及 transition_id。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID |
| transition_id | string | 否 | 状态流转 ID，从 `lark-project__get_transitable_states` 获取 |
| project_key | string | 否 | 空间 key |

### lark-project__get_node_detail
获取工作项中指定节点或所有节点的完整详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID 或名称 |
| node_id_list | array | 否 | 节点 ID 列表，传空或 `_all` 获取所有节点 |
| field_key_list | array | 否 | 节点字段 key，传空或 `_all` 获取所有字段 |
| need_sub_task | boolean | 否 | 是否需要节点子项（子任务） |
| page_num | number | 否 | 节点信息一次最多 20 个，按页返回 |
| project_key | string | 否 | 空间 key |

### lark-project__update_node
修改节点（排期、负责人、自定义字段等）。排期/差异化排期/负责人不要同时修改，需分多次调用。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID |
| node_id | string | 是 | 节点 ID（node_key） |
| node_owners | array | 否 | 节点负责人 userkey 数组；清空传空数组 `[]` |
| node_schedule | object | 否 | 节点排期，格式 `{"estimate_start_date":ms,"estimate_end_date":ms,"owners":[userkey],"points":数字}`；清空传 `{}`；不变更则不传 |
| schedules | array | 否 | 按人差异化排期，每项细化到单个人的排期；清空某人则 `estimate_start_date`/`estimate_end_date` 传 null |
| fields | array | 否 | 节点自定义字段，每项含 `field_key` 和 `field_value`（STRING 协议，见「字段值格式」） |
| project_key | string | 否 | 空间 key |

---

## MyWork 工作台域

### lark-project__list_todo
按 action 类型查询当前用户的工作项列表。无需 MQL 即可查询待办/已办。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| action | string | 是 | todo(待办)/done(已办)/overdue(逾期)/this_week(本周待办) |
| page_num | number | 是 | 页码，从 1 开始，每页 50 条 |
| asset_key | string | 否 | 工作区 key（格式 Asset_xxx），仅在报错需要选择时传 |

需完整结果时，从 page_num=1 连续翻页直到空为止。

---

## WorkHour 工时域

> 工时记录查询（`lark-project__get_workitem_man_hour_records`）的参数表见 [references/misc.md](references/misc.md)。

### lark-project__list_schedule
获取指定人员在时间区间内的排期与工作量明细。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| user_keys | array | 是 | 用户标识（名称/邮箱/userkey），**每次最多 20 个** |
| start_time | string | 是 | 开始时间，格式 YYYY-MM-DD |
| end_time | string | 是 | 结束时间，格式 YYYY-MM-DD，**单次跨度最大 3 个月** |
| work_item_type_keys | array | 否 | 工作项类型列表，查询所有传入 `_all` |

**调用约束**：每次最多 20 人（多人拆批次并行）；单次跨度 ≤ 3 个月（超出按月拆分）；所有批次完成后再汇总，未完整获取前不得输出结论。

---

## UserGroup 人员域

> 团队相关工具（`lark-project__list_project_team` / `lark-project__list_team_members`）的参数表见 [references/misc.md](references/misc.md)。

### lark-project__search_user_info
批量查询用户基础信息。用于将姓名/邮箱转换为 userkey。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_keys | array | 是 | userKey、Email 或名字，最多 20 个 |
| project_key | string | 否 | 空间 key |
| need_all_status | boolean | 否 | 是否返回所有状态用户；默认 false，仅返回在职用户 |

### 当前用户身份

MQL 中可直接使用 `current_login_user()`。需要实际 userkey 时，可调用 `lark-project__search_user_info`，传 `user_keys=["current_login_user()"]`，从真实结果提取身份；此为身份查询特殊标记，不能直接传给人员字段或状态流转参数。详见 [references/auth-guard.md](references/auth-guard.md)。

---

## View 视图域

> 视图搜索与固定视图管理（`lark-project__search_view_by_title` / `lark-project__create_fixed_view` / `lark-project__update_fixed_view`）的参数表见 [references/view.md](references/view.md)。

### lark-project__get_view_detail
根据视图 ID 获取该视图下的工作项列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| view_id | string | 是 | 视图 ID |
| project_key | string | 否 | 空间 key |
| page_num | number | 否 | 分页页数起点 |
| fields | array | 否 | 要查询的字段 |

---

## Comment 评论域

> 评论列表查询（`lark-project__list_workitem_comments`）的参数表见 [references/misc.md](references/misc.md)。

### lark-project__add_comment
添加评论。支持富文本 Markdown，语法详见 [references/rich-text-editor-markdown-syntax.md](references/rich-text-editor-markdown-syntax.md)（含 @提及、对齐、链接预览、字号/颜色等扩展语法）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID |
| content | string | 是 | 评论内容 |

---

## Deliverable 交付物域

> 单工具小域，参数表见 [references/misc.md](references/misc.md)。

### lark-project__list_deliverables
查看交付物详情及其根工作项 / 来源工作项。可按工作项 ID 列表过滤。

---

## Resource 资源库

> 资源库（资源模板）管理。`lark-project__create_resource_work_item` 当前对应 MCP `lark-project__create_resource_work_item`，用于创建资源实例；查看资源库的字段 / 角色配置用 `lark-project__get_resource_work_item_type_conf`。详细参数表见 [references/misc.md](references/misc.md)。

### lark-project__create_resource_work_item
在已启用资源库的工作项类型下创建资源模板（资源实例）。创建前先调 `lark-project__get_resource_work_item_type_conf` 取字段 / 角色配置。

**语义边界**：
- 创建资源实例：`work_item_type_key` 是资源库启用的工作项类型；`template_id` 是该类型下的流程模板 ID/名称；`fields` / `roles` 是新资源实例自身的字段和角色。
- 从资源实例创建普通工作项：不要把已有资源实例 ID 填到 `work_item_type_key` 或 `template_id`。必须以当前 `lark-project__create_resource_work_item` 的 实时工具 schema 为准确认是否有源资源实例参数；若当前 schema 未暴露该参数，先向用户说明无法确认自动化参数，不要猜。

---

## WBS 计划表

> 计划表（WBS）有 **草稿（draft）** 与 **已发布实例（instance）** 两套数据模型。常见编辑流程：`lark-project__create_wbs_draft` → 多次 `lark-project__edit_wbs_draft` → `lark-project__publish_wbs_draft`；放弃改动用 `lark-project__reset_wbs_draft`。详细参数表与 `lark-project__edit_wbs_draft` 的 operation 子类型见 [references/wbs.md](references/wbs.md)。

### lark-project__list_wbs_draft_rows
在计划表草稿中按条件筛选行。常用筛选字段：`wbs_name`、`wbs_parent_id`、`wbs_owner_in_charge`、`wbs_states_doing`。详见 [references/wbs.md](references/wbs.md)。

### lark-project__list_wbs_instance_rows
在已发布的线上计划表实例中按条件筛选行。参数同 `lark-project__list_wbs_draft_rows`。

### lark-project__edit_wbs_draft
对计划表草稿执行一次原子编辑。一次调用只能传一个 `operation_type`，但该操作内部可通过 `items` / `uuids` 等数组承载单行或批量编辑；支持新增 / 删除 / 恢复 / 排序 / 改名 / 改负责人 / 改阶段 / 改排期 / 改估分 / 改实际工时等，结构见 [references/wbs.md](references/wbs.md)。
> ⚠️ **前置**：草稿不存在时先调 `lark-project__create_wbs_draft`，再调 `lark-project__edit_wbs_draft`。判断方法：直接 `lark-project__list_wbs_draft_rows` 报"草稿不存在"类错误即视为缺失草稿。

### lark-project__publish_wbs_draft
将编辑完成的草稿发布到线上。
> ⚠️ 全量发布前必须用**固定话术**二次确认："本人及协同者的全部编辑内容均会被发布，请确认是否全量发布？"；部分发布（传入 `uuid_strings_list`）无需二次确认。

---

## 其它低频域

度量图表、子任务、关系定义查询的工具参数表见 [references/misc.md](references/misc.md)：

- **Chart 度量域** — `lark-project__get_chart_detail` / `lark-project__list_charts`
- **SubTask 子任务域** — `lark-project__update_node_subtask`（create/update/confirm/rollback）
- **Relation 关系域** — `lark-project__list_related_workitem` / `lark-project__list_workitem_relations`
- **WBS 计划表 · 辅助工具** — `lark-project__create_wbs_draft` / `lark-project__reset_wbs_draft` / `lark-project__get_wbs_draft_operation_progress` / `lark-project__list_element_template`（见 [references/wbs.md](references/wbs.md)）

---

## 字段值格式（field_value）

> 🚨 **STRING 协议**：`field_value` 协议层固定为字符串。标量（text/number/bool/option_id/userkey/毫秒）直接作字符串；数组、对象**必须先 JSON.stringify** 再传，直接传会报 `need STRING type, but got: LIST` / `MAP`。
> 例：multi-user 正确写法为 `"[\"<userkey>\"]"`，错误写法为 `["<userkey>"]`。

| 字段类型 | 语义 | field_value 传参（已按前述规则序列化） |
|---------|------|------|
| template | 模板 ID（**创建必填**） | `"<template_id>"` — 用 `lark-project__list_workitem_field_config(field_keys=["template"])` 获取 |
| text / multi-pure-text / link / bool / number | 单个字面值 | `"需求标题"` / `"100"` / `"true"` |
| user | 单个 userkey | `"<userkey>"` |
| multi-user | userkey 数组（**stringified**） | `"[\"<userkey1>\",\"<userkey2>\"]"` |
| select | 已有枚举项传 option_id；确认新增后传 `free_add` 对象（**stringified**） | `"<option_id>"` / `"{\"option_id\":\"<new_id>\",\"option_name\":\"<名称>\",\"free_add\":true}"` |
| radio / tree-select | 枚举项 option_id | `"<option_id>"` |
| multi-select | option_id 对象数组（**stringified**）；确认新增后，新增项传 `option_name` 和 `free_add:true` | `"[{\"option_id\":\"<existing_id>\"},{\"option_id\":\"<new_id>\",\"option_name\":\"<名称>\",\"free_add\":true}]"` |
| tree-multi-select | option_id 字符串数组（**stringified**） | `"[\"id1\",\"id2\"]"` |
| multi-text | 富文本 Markdown 字符串（语法详见 [references/rich-text-editor-markdown-syntax.md](references/rich-text-editor-markdown-syntax.md)） | `"**加粗**内容"` |
| date | 毫秒时间戳（天精度） | `"1722182400000"` |
| schedule | `[开始ms, 结束ms]`（**stringified**） | `"[1722182400000,1722355199999]"` |
| precise_date | 对象（**stringified**） | `"{\"start_time\":1722182400000,\"end_time\":1722355199999}"` |
| workitem_related_select | 关联工作项 ID | `"<work_item_id>"` |
| workitem_related_multi_select | ID 数组（**stringified**，数字元素） | `"[<id1>,<id2>]"` |
| role_owners（仅创建时） | 角色-人员对象数组（**stringified**） | `"[{\"role\":\"<role_id>\",\"owners\":[\"<userkey>\"]}]"` |
| signal | option_id 字符串（**写入值位**；MQL 查询值位为 label，见 [mql-operators.md §1](references/mql-operators.md)） | `"<option_id>"`（以 `lark-project__list_workitem_field_config` 的 `options[].option_id` 为准；当前系统外信号常见 4 个 option：`passed` / `notpassed` / `processing` / `noinformationyet`） |
| compound_field | 普通复合明细表（**stringified** action 对象） | `"{\"action\":\"add\",\"fields\":[[{\"field_key\":\"sub_key1\",\"field_value\":\"v1\"}]]}"` |
| multi_user_compound_field | 多人复合明细表（**仅更新已有人员**；stringified userkey map，整体覆盖） | `"{\"userkey1\":[{\"field_key\":\"sub_key1\",\"field_value\":\"v1\"}],\"userkey2\":[]}"` |

> 更新角色时不用 fields，用 `lark-project__update_field` 的 `role_operate` 参数。
> `select` / `multi-select` 写入前先按 `option_name` 精确匹配已有选项。未命中或选项列表为空时，先展示近似选项，并询问是否将目标值新增为选项并选中；用户已明确要求新增时无需重复确认。确认后使用 `free_add`；`option_id` 必须非空、不同于 `option_name` 且不与已有 ID 冲突。

### 普通复合明细表（compound_field）

普通复合明细表通过 `lark-project__update_field` 写入时，`field_value` 是 **stringified JSON action 对象**。直接传 JSON object 会在客户端序列化阶段报 `unsupported type: map[string]interface {}, expected type: STRING`。

```json
{"action": "add", "fields": [[{"field_key": "子字段key", "field_value": "子字段值"}]]}
```

- **action** — 操作类型：`"add"`（新增行）、`"update"`（更新行）、`"delete"`（删除行）
- **fields** — **二维数组**：外层每个元素代表一行记录，内层是该行的子字段列表
- 子字段的 `field_value` 遵循各自字段类型的 STRING 协议（text 传纯字符串，multi-user 传 stringified 数组等）
- 子字段 key 从 `lark-project__list_workitem_field_config` 返回的 `compound_field_info` 中获取
- `add` 不传行标识；读取新增结果后，每行会带 `group_uuid`
- `update` / `delete` 必须原样传 `group_uuid` 定位行，键名就是 `group_uuid`，**不是 `record_id`**

更新一行：

```json
{"action": "update", "group_uuid": "读回的组标识", "fields": [[{"field_key": "子字段key", "field_value": "新值"}]]}
```

删除一行：

```json
{"action": "delete", "group_uuid": "读回的组标识"}
```

### 多人复合明细表（multi_user_compound_field）

多人复合明细表**不使用 action / group_uuid 协议**。写入值是 **stringified JSON map**：key 为填写人的 userkey，value 为该人员的子字段数组。

```json
{
  "userkey1": [
    {"field_key": "子字段key", "field_value": "子字段值"}
  ],
  "userkey2": []
}
```

🚨 **整体覆盖，非增量更新**。仅传部分 userkey 会导致未包含的 userkey 整行被删除。更新前必须：

1. 用 `lark-project__get_workitem_brief` 读取当前多人复合字段；返回 map 的 key 是当前人员范围，每个 value 含 `user`，有值时另含 `child_field_list`
2. 用 `lark-project__list_workitem_field_config` 读取 `compound_field_info`，确定子字段 key、类型和枚举 option_id
3. 重建**包含全部现有 userkey** 的 map；非目标人员的子字段值也要保留，只修改目标人员
4. 将完整 map JSON.stringify 后写回；写后再次读取核对所有人员和目标子字段

此协议只用于修改 `lark-project__get_workitem_brief` 当前 map 中**已经存在的人员**。元数据接口只返回子字段配置；`lark-project__list_workitem_role_config` 只返回角色字典，二者均不返回 `editable_personnel_range_type`、字段绑定角色、可选人员或新增人员协议。若当前值为空或目标人员不在 map 中，立即停止并说明当前 MCP 工具 无法自动新增人员；由用户先通过页面把人员加入范围，再重新读取后更新。不要尝试用 `{"userkey":[]}` 新增人员——接口会返回成功但回读仍为空。

枚举子字段仍传 option_id；读取返回的 `{label, value}` 不能原样回写，应取其中的 option_id 值。修改接口返回空成功不代表已落值，必须回读；若人员或目标值未变化，按未生效报告，不得宣称成功。

### 关联工作项字段（workitem_related_*）

用户提供名称而非 ID 时，需按名称→ID 转换流程（搜目标空间+类型，消歧，写入格式，防循环引用）：详见 [references/field-value-extras.md](references/field-value-extras.md)。

---

## 常用场景速查

| 场景 | 工具（注意点） |
|------|-------|
| 空间名 → project_key | `lark-project__search_project_info` |
| 查类型 / 字段 / 角色 | `lark-project__list_workitem_types` / `lark-project__list_workitem_field_config` / `lark-project__list_workitem_role_config` |
| 人名 → userkey | `lark-project__search_user_info`（批量 ≤20） |
| 当前用户 | MQL 使用 `current_login_user()`；实际 userkey 见 [认证与身份](references/auth-guard.md) |
| 条件查询 / 个人待办 | `lark-project__search_by_mql`（MQL） / `lark-project__list_todo` |
| 团队排期 | `lark-project__list_schedule`（≤20 人、≤3 月） |
| 创建 / 修改工作项 | `lark-project__create_workitem` / `lark-project__update_field`（字段 fields，角色 role_operate） |
| 节点流转 / 状态流转 | `lark-project__transition_node`（confirm/rollback） / `lark-project__transition_state`（先 `lark-project__get_transitable_states`） |
| 视图数据 | `lark-project__get_view_detail` |
| 生成 Meegle 页面链接 | 仅在用户明确要求链接或链接本身是交付物时，读取 [references/url-links.md](references/url-links.md) |

## 链接生成

仅当用户明确要求“给链接 / 拼链接 / 打开地址”，或链接本身是请求的交付物时，读取并执行 [references/url-links.md](references/url-links.md)。不要给普通查询、创建或更新结果自动附加链接。


## 通用规范

### 请求处理流程

1. **定位目标**：提取空间、工作项类型、时间、人员、筛选条件。URL 先调用 `lark-project__url_decode`，按 [references/url-kinds.md](references/url-kinds.md) 选择业务分支，再用查询验证。区分空间名和业务线等筛选维度。
2. **确认身份与参数**：按 [references/auth-guard.md](references/auth-guard.md) 使用当前 OAuth 连接。用 `lark-project__search_project_info`、`lark-project__list_workitem_types`、`lark-project__search_user_info` 确认空间、类型、人员。唯一匹配直接使用，多义或缺失必填项合并询问。simple_name 不等于 project_key。
3. **收集元数据**：字段配置同时指定 `project_key` 和 `work_item_type`，按 `field_keys` 或 `field_query` 缩小范围；角色配置可独立查询。状态、枚举、角色和节点名称以该空间、类型的真实配置为准，不硬编码。简单评论等操作不必拉取无关配置。
4. **执行并验证**：遵循实际工具 schema、对应 SOP 与 [分页和并发规则](references/performance.md)。更新、创建或流转后回读目标确认；返回成功不能替代写后验证。
5. **交付结果**：说明已完成的操作与失败项。用户需要分析时基于已取得的数据继续完成；工具缺失或数据未完整时按 [能力边界](references/capabilities.md) 说明限制，不生成额外的站外分析入口。

### 并行与大结果

详见 [references/performance.md](references/performance.md)：并行调用（必须串行的链路、可并行的组合）、大结果分批与翻页规则。

### 错误处理

**总则**：先检查 MCP 错误标记和所有错误文本，从 `err_msg` / `inner_err` 提取原因；认证失效时停止并重新连接。读取或明确未执行的请求最多针对性修正重试 2 次；写入结果未知时先回读确认，不能重复创建、评论或发布。详细规则见 [references/error-handling.md](references/error-handling.md)。

**熔断条件**（立即终止，禁止盲目重试）：
- 空间未找到（`lark-project__search_project_info` 连续 3 次失败）
- Permission Denied（当前用户对该空间无访问权限）
- 必需工具缺失、连接失效或写入结果无法确认，先说明具体阻塞

详细自愈规则与错误速查表（涵盖字段格式、节点流转、人员转换等常见报错）见 [references/error-handling.md](references/error-handling.md)。

---

## 分析与能力边界

在当前会话中完成用户需要的总结、诊断或建议。先确认分页与范围完整，再区分事实和推断。缺少所需工具时交付已验证的部分，指出尚未完成的步骤；细则见 [references/capabilities.md](references/capabilities.md)。

---

## 操作指南（SOP）

具体操作的完整流程、字段转换和自愈机制见对应 SOP：

- [创建工作项](references/sop-create-workitem.md) — 创建需求、任务、缺陷
- [更新工作项](references/sop-update-workitem.md) — 修改字段、更新角色、追加内容
- [流转节点（节点流）](references/sop-transition-node.md) — 完成/回滚节点、批量流转
- [流转状态（状态流）](references/sop-transition-state.md) — 流转缺陷/issue、关闭 bug
