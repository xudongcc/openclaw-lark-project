# 工作项元数据工具

查询工作项类型、字段、角色配置的辅助工具。在 `lark-project__create_workitem` / `lark-project__update_field` / `lark-project__search_by_mql` 之前用来确认合法 key。

## lark-project__list_workitem_types
获取指定空间下所有工作项类型列表。用户描述模糊时用此工具确认合法 type_key。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 projectKey |

## lark-project__list_workitem_field_config
获取指定空间和工作项类型的可用字段配置（不含禁用字段和角色配置）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_type | string | 是 | 工作项类型 key 或名称 |
| page_num | number | 是 | 页数，每页 50 条，从 1 开始 |
| field_keys | array | 否 | 精确匹配字段 key 或名称 |
| field_query | string | 否 | 模糊查询字段 key 和名称 |
| field_types | array | 否 | 按字段类型筛选 |

## lark-project__list_workitem_role_config
获取指定工作项类型的角色列表。用于查询/创建/更新工作项前确认合法 role_key。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_type | string | 是 | 工作项类型 key 或名称 |
| page_num | number | 是 | 页数，每页 50 条，从 1 开始 |
| role_keys | array | 否 | 精确匹配角色 key 或名称 |
| role_query | string | 否 | 模糊查询角色 key 和名称 |

## lark-project__get_workitem_field_meta
查看创建工作项时可用的字段及类型。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_type | string | 是 | 要创建的工作项类型 key |
