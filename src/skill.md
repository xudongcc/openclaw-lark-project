# lark-project-workitem（OpenAPI）

目标：使用飞书项目 OpenAPI 管理工作项；工具参数风格借鉴 MCP 设计。

## 推荐调用流程
1. 先调用 `get_workitem_info` 获取空间/类型字段信息。
2. 再调用 `search_by_mql` 执行 MOQL。
3. 如需状态变更，调用 `update_workitem_status`。

## 约束
- 查询字段优先使用可读中文名。
- `project_key` 必填。
- 分页可用 `session_id` + `group_pagination_list`。

## 说明
当前端点路径使用了占位路径（`/open_api/moql/search` 等）。
如你提供精确 OpenAPI 路径，我可以马上替换为官方路径并联调。
