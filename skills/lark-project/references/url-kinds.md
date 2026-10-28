# URL Kinds —— `lark-project__url_decode` 返回值到 SOP 的映射

## 为什么先调用解析工具

Meego/飞书项目的路由非常多，且 snake_case 旧路径、`/meego/` 前缀、`_xxx_resource` 资源工作项、预置功能区（user-gantt / chart / multi-project-view 等）这些都会让"看起来像工作项详情页"的 URL 其实不是。**禁止**自己从 URL 截取路径段作参数。

统一调用原生工具：

```json
{
  "name": "lark-project__url_decode",
  "arguments": {
    "url": "<URL>"
  }
}
```

拿到 `url_kind` 后按本文表格选择 SOP 或说明能力边界。纯本地解析，无网络调用；不会验证业务对象或权限。工具保留官方路由、别名和资源包装规则，额外拒绝歧义编码、反斜杠、控制字符与点路径段。query 每个 key 仅保留首值，fragment 不参与匹配。

---

## 返回字段

| 字段 | 说明 |
|---|---|
| `url_kind` | 必返；未识别时为 `unknown` |
| `simple_name` | 仅为空间查询线索；需要 `project_key` 时先 `lark-project__search_project_info` 用 `simple_name` 作为输入 |
| `work_item_type` | 工作项类型 api_name（已脱去 `_xxx_resource` 包装） |
| `work_item_id` | 工作项 ID（字符串） |
| `view_id` / `chart_id` / `plugin_key` / `team_id` / `template_id` | 按路径分别返回 |
| `setting_type` | 设置页子参数（如 permission 类型） |
| `edit_str` | `homepage/edit`、`overview/edit` 的编辑态标记 |
| `is_resource` | true 表示路径里带 `_xxx_resource` 包装 |
| `query` | 原始 query 参数，保留 `scope/node` 等二级导航上下文 |
| `redirected_from` | 若经别名归一化或 `/meego/` 前缀剥离，记录原始路径 |
| `pathname` / `host` / `raw` | 诊断用 |

---

## `url_kind` → 允许的 SOP

### 工作项类

| url_kind | 可用字段 | 推荐 SOP / 工具 |
|---|---|---|
| `workitem_detail` | simple_name · work_item_type · work_item_id | `sop-update-workitem` / `sop-transition-node` / `sop-transition-state` 任一，先 `lark-project__search_project_info` → `lark-project__get_workitem_brief` |
| `workitem_create` | simple_name · work_item_type | `sop-create-workitem`（`lark-project__create_workitem`） |
| `workitem_draft` | simple_name · work_item_type | 同上，提示用户这是草稿视图 |
| `workitem_homepage` / `workitem_homepage_edit` | simple_name · work_item_type | 无具体工作项 ID — **拒绝**直接操作，要求用户提供详情页 URL 或工作项 ID |

### 视图类（有 `view_id` 但无 `work_item_id`）

| url_kind | 语义 | 处理 |
|---|---|---|
| `view_story` / `view_issue` | 需求 / 缺陷视图 | 用 `lark-project__get_view_detail` 查询；单个工作项操作需具体目标，整个视图操作需完整查询、固定并验证目标集合 |
| `view_multi_project` | 跨空间 / 全景视图 | 用 `lark-project__list_multi_project_view_workitems` 查询，再验证目标集合 |
| `view_project_overview` / `view_user_gantt` | 空间概览 / 甘特视图 | 用 `lark-project__get_view_detail` 查询；不与跨空间视图混用 |
| `view_chart` | 图表视图 | 用 `lark-project__get_view_detail` 查询 `view_id`；只有另行取得权威 `chart_id` 后才能调用图表详情工具，不能把 view_id 当 chart_id |
| `view_workitem` | 通用工作项视图 | 用 `lark-project__get_view_detail` 查询；若 `is_resource=true`，保留资源语义，查询确认类型与目标后再操作 |

### 图表类

| url_kind | 可用字段 | 处理 |
|---|---|---|
| `chart_detail` | simple_name · chart_id | 图表详情；可用 `lark-project__get_chart_detail` |
| `chart_create` | simple_name | 图表创建入口（无 ID） |
| `chart_homepage` / `chart_datascope*` / `chart_penetrate*` | simple_name · chart_id? | 抽屉/子页，通常**不**作为操作目标 |

### 空间/设置类（设置写入不在当前工具范围）

| url_kind | 说明 |
|---|---|
| `project_home` · `project_overview` · `project_empty` · `project_ai_assist` | 空间级落地页，`simple_name` 可用于 `lark-project__search_project_info` |
| `project_overview_edit` | 编辑态，不作为操作目标 |
| `project_404` · `project_401` · `project_500` | 错误页，**拒绝** |
| `setting_*` | 各类设置页；本技能不做设置写操作，**拒绝**并告知 |
| `setting_other` | 未枚举的 setting 子页（前端通过非 exact 路由内部渲染），等同于 `setting_*` — **拒绝** |
| `import_jira` · `import_excel` · `data_recycle` | 导入/回收操作在界面内完成，**拒绝** |
| `plugin_page` | 插件页 — 行为由插件定义，当前工具无法操作，**拒绝** |

### 全局/导航类

| url_kind | 处理 |
|---|---|
| `workbench` · `workspaces` · `favorites` · `inbox` | 顶级导航页，**没有具体目标**，请追问 |
| `teams` · `team_detail` | 团队页；`team_detail` 的 `team_id` 可用于 `lark-project__list_team_members` |
| `templates` · `template_detail` · `template_manage` | 模板中心，本技能不做模板操作，**拒绝** |
| `project_list` | 全部空间列表，追问具体空间 |

### 系统域 `/b/*`

| url_kind | 处理 |
|---|---|
| `preference` · `mcp_config` · `mcp_auth` · `ai_hub` · `handover` · `onboarding_*` · `trial_*` · `cross_*` · `slack_connect` · `resource_handover` · `no_project_auth` · `login_datacenter` · `unbundled_register_result` · `b_home` | 系统/管理页，本技能**拒绝**业务操作 |

### 登录/外部入口

| url_kind | 处理 |
|---|---|
| `login_fetch_cookie` · `login_asset` · `switch_asset` · `home_ka` · `tenant_select` · `tenant_create` · `channel_error` | 登录相关 — 改走 `auth-guard` |
| `quick_create_form` · `issue_trans` · `issue_create_open_usecase` · `story_create_open` · `jump_to_outer` · `light_share` · `ai_application_share` | 飞书内嵌入口，本技能通常不作为操作起点 |

### 错误兜底

| url_kind | 处理 |
|---|---|
| `lark_page_404` · `project_empty_page` · `route_loading` · `system_upgrade` | 错误页，**拒绝** |
| `unknown` | **拒绝**并要求用户提供详情页 URL 或直接描述任务 |

### 特殊字段校验

- `redirected_from` 非空 → 原路径已经归一化；保留以便诊断，不必对普通业务回复增加说明
- `is_resource=true` → 保留资源工作项/视图语义，不能混成普通工作项
- `query.scope` / `query.node` 非空 → 仅作为导航上下文，不要当作业务参数

---

## 典型分支模板（供 SOP 引用）

```
STEP 0 — URL 解析（仅当用户提供了 URL）

  lark-project__url_decode({"url":"<URL>"})
  SAVE $url_kind, $simple_name, $work_item_type, $work_item_id, $view_id, $redirected_from

  SWITCH $url_kind:
    - workitem_detail    → GOTO 本 SOP 的 STEP 1（已具备 simple_name + work_item_id）
    - workitem_homepage  → ASK user："需要具体工作项 URL，这是类型主页。"；STOP
    - view_*             → 按视图分支查询；单项操作需具体目标，整视图操作需完整取得并验证目标集合
    - unknown            → ASK user："无法识别该 URL，请确认后重发或直接描述任务。"；STOP
    - 其他非本 SOP 范围   → 告知 kind，建议对应操作；STOP
```
