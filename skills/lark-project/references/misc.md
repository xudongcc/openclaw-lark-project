# 其它低频工具

低频/单工具小域的参数表汇总。涵盖团队、图表、子任务、关系、评论查询、工时记录、交付物、资源库、WBS 辅助工具。

---

## 团队

### lark-project__list_project_team
查看空间下的团队列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 否 | 空间 key |

### lark-project__list_team_members
查看团队成员列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| team_id | string | 是 | 团队 ID |

---

## 度量图表

### lark-project__get_chart_detail
查看图表详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| chart_id | string | 是 | 图表 ID |

### lark-project__list_charts
查看视图下的图表列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| view_id | string | 是 | 视图 ID |

---

## 子任务

### lark-project__update_node_subtask
创建/修改/完成/回滚子任务。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| node_id | string | 是 | 节点 ID |
| work_item_id | string | 是 | 工作项 ID |
| action | string | 是 | create/update/confirm/rollback |

---

## 关系

### lark-project__list_related_workitem
查看关联的工作项列表。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_id | string | 是 | 工作项 ID |
| relation_field_key | string | 否 | 关联关系字段 key，从 `lark-project__list_workitem_relations` 获取 |
| relation_id | string | 否 | 关联关系 ID，从 `lark-project__list_workitem_relations` 获取 |
| node_id | string | 否 | 节点 ID，查询某节点下的关联时传入 |
| page_num | number | 否 | 分页页码，从 1 开始 |
| page_size | number | 否 | 每页数量，最大 50 |

### lark-project__list_workitem_relations
查看空间下的关联关系定义。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |

---

## 评论查询

### lark-project__list_workitem_comments
查看评论列表。添加评论用 `lark-project__add_comment`（见 SKILL.md 主文件）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_id | string | 是 | 工作项 ID |

---

## 工时记录

### lark-project__get_workitem_man_hour_records
查看工作项的工时登记记录。团队排期用 `lark-project__list_schedule`（见 SKILL.md 主文件）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_type | string | 是 | 工作项类型 |
| work_item_id | string | 是 | 工作项 ID |

---

## 交付物

### lark-project__list_deliverables
查看交付物详情及其所属根工作项 / 来源工作项。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_ids | string[] | 否 | 工作项 ID 列表；URL 先按 [url-kinds.md](url-kinds.md) 识别并查询验证；提供名称需先调 `lark-project__get_workitem_brief` 拿 ID |

---

## 资源库

### lark-project__create_resource_work_item
在已启用资源库的工作项类型下创建资源模板（资源实例）。先调 `lark-project__get_resource_work_item_type_conf` 取字段 / 角色配置。

**创建资源实例 vs 从资源实例创建普通工作项**：
- 创建资源实例：使用 `lark-project__create_resource_work_item`；`work_item_type_key` 表示资源库启用的工作项类型，`template_id` 表示流程模板，`fields` / `roles` 描述新资源实例自身。
- 从资源实例创建普通工作项：这是“基于已有资源实例派生/创建业务工作项”的语义，参数通常需要源资源实例标识。当前工具参数必须以 实时工具 schema 为准；若没有显式源资源实例参数，不要把源资源实例 ID 塞进 `work_item_type_key`、`template_id` 或普通字段里猜测调用。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_type_key | string | 是 | 工作项类型 key 或名称；失败时先调 `lark-project__list_workitem_types` |
| fields | object[] | 否 | 资源字段列表，每项含字段 key 与字段值 |
| roles | object[] | 否 | 角色人员；为空则不指定 |
| template_id | string | 否 | 工作流模板 ID 或名称；未传则取该工作项类型的第一个流程模板 |

### lark-project__get_resource_work_item_type_conf
查看资源库的字段 / 角色配置。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_type_key | string | 是 | 工作项类型 key 或名称 |

---

## WBS 辅助工具

> 计划表（WBS）的核心查询 / 编辑 / 发布工具见 [wbs.md](wbs.md)。本节仅收 4 个辅助工具：草稿生命周期管理（create-draft / reset-draft）、异步操作进度查询（get-draft-progress）、流程资源库元素查询（list-element-templates）。

### lark-project__create_wbs_draft
为指定工作项实例创建新的计划表草稿。当需要编辑计划表但当前不存在草稿时，先调本工具创建草稿，再配合 `lark-project__edit_wbs_draft` 进行编辑。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID，单值；URL 先按 [url-kinds.md](url-kinds.md) 识别并查询验证 |
| project_key | string | 是 | 空间 key |

### lark-project__reset_wbs_draft
将草稿重置为线上实例状态，**放弃所有未发布的修改**。不传 `uuids` 时全量重置。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| work_item_id | string | 是 | 工作项 ID |
| project_key | string | 是 | 空间 key |
| uuids | string[] | 否 | 要重置的行 uuid 列表；为空则全量重置 |

### lark-project__get_wbs_draft_operation_progress
查询计划表草稿异步操作（create / edit / publish / reset）的执行进度。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_id | string | 是 | 工作项 ID 或名称 |
| op_type | string | 是 | 操作类型：`create` / `edit` / `publish` / `reset` |
| operation_id | string | 是 | 操作 ID（由 create-draft / edit-draft / publish-draft / reset-draft 返回） |

### lark-project__list_element_template
列出流程资源库中的资源节点（node）或资源任务（task）模板。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| element_type | string | 是 | 资源库类型：`node` 或 `task` |
| project_key | string | 是 | 空间 key |
| work_item_type | string | 是 | 工作项类型 key 或名称 |
| page_size | number | 否 | 页大小 |
| page_no | number | 否 | 页码 |
