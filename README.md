# Lark Project Workitem Plugin (OpenAPI Scaffold)

这个插件现在是 **OpenAPI 实现**（不调用 MCP），但工具名和参数风格借鉴了 Feishu Project MCP 文档。

## 已完成
- 配置项：`pluginId` / `pluginSecret` / `userKey`
- Token：`src/token.ts`（fetch + 内存缓存）
- OpenAPI Client：`src/openapi-client.ts`
- 工具注册：`src/index.ts`

## 已注册工具（10个）
- `create_workitem`
- `finish_node`
- `get_node_detail`
- `get_view_detail`
- `get_workitem_brief`
- `get_workitem_info`
- `list_schedule`
- `list_todo`
- `search_by_mql`
- `update_field`

## 说明
- 当前已对齐工具输入参数 schema。
- OpenAPI endpoint 仍是占位路径（见 `src/openapi-client.ts` 的 `ENDPOINTS`），需要按官方接口文档替换成准确路径。
