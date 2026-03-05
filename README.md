# Lark Project Workitem Plugin (Scaffold)

当前是 OpenAPI 版本骨架（不调用 MCP）。

已包含：
- `openclaw.plugin.json`（`configSchema` + `uiHints`）
- 必填配置：`pluginId` / `pluginSecret` / `userId`
- `pluginSecret` 标记为敏感字段（`sensitive: true`）
- `src/token.ts`：fetch 获取 token（内存缓存）
- `src/openapi-client.ts`：OpenAPI 调用封装
- `src/index.ts`：注册工具

## 已注册工具
- `get_workitem_info`
- `search_by_mql`
- `update_workitem_status`

> 工具设计借鉴 MCP 的参数风格；底层调用为 OpenAPI。

## Token 存储建议
- MVP：仅内存缓存（推荐）
- 生产：可选落盘（最小化字段 + 文件权限 600）

## 待联调项
当前 OpenAPI path 使用占位路径：
- `/open_api/work_item/info`
- `/open_api/moql/search`
- `/open_api/work_item/update`

你给我官方准确 endpoint 后，我会在 1 次提交内替换并完成联调。
