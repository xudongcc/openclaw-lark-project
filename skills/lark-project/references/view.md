# 视图辅助工具

视图搜索与固定视图管理。读取视图数据用 `lark-project__get_view_detail`（见 SKILL.md 主文件）。

## lark-project__search_view_by_title
按名称搜索视图。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| view_scope | string | 是 | 视图范围 |
| key_word | string | 是 | 关键词 |

## lark-project__create_fixed_view
创建固定视图。上限 200 个工作项。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| name | string | 是 | 视图名称 |
| work_item_type | string | 是 | 工作项类型 |
| work_item_id_list | array | 是 | 工作项 ID 列表 |

## lark-project__update_fixed_view
更新固定视图。add/remove_work_item_ids 二选一。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| view_id | string | 是 | 视图 ID |
| work_item_type | string | 是 | 工作项类型 |

## lark-project__list_multi_project_view_workitems
查看全景视图（multiProjectView）下当前用户有权限的工作项列表。全景视图的链接上带有 `multiProjectView` 关键字，可从中提取 `view_id`。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| view_id | string | 是 | 全景视图 ID |
| page_num | number | 否 | 分页页码，每页 50 条，从 1 开始 |
