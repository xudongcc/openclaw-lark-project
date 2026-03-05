# Lark Project Workitem Plugin (Scaffold)

当前是第一版架构骨架，已包含：
- `openclaw.plugin.json`（含 `configSchema` + `uiHints`）
- 必填配置：`pluginId` / `pluginSecret` / `userId`
- `pluginSecret` 已标记为敏感字段（`sensitive: true`）
- `src/index.ts` 插件入口（待补充 API 调用与工具注册）

## Token 获取与缓存建议
- 已在 `src/token.ts` 加入 `TokenManager`，使用 **fetch** 获取：
  - `plugin_access_token`
  - `user_access_token`
- 当前实现为**仅内存缓存**（带过期时间，提前 30 秒刷新）。

### 为什么先用内存缓存
- 安全：重启进程后 token 自动失效，不落盘泄露风险更低。
- 简单：MVP 阶段足够稳定。

### 生产环境推荐
- `pluginSecret` 放在插件 config（已 `sensitive: true`）。
- access_token **不建议长期落盘**。
- 若必须落盘（跨重启减少登录开销），建议：
  1. 写到独立状态文件（如 `~/.openclaw/state/lark-project/tokens.json`）
  2. 文件权限限制为 `600`
  3. 仅保存短期 token + 过期时间，不保存更多敏感上下文

## 已按 MCP 工具参数落地
- 新增工具：`search_by_mql`
- 参数对齐：`project_key`（必填）、`moql`、`session_id`、`group_pagination_list`
- 调用方式：通过 `fetch` 调 `mcpBaseUrl`（默认 `https://project.feishu.cn/mcp_server/v1`）
- 工具名对齐 MCP：`mcp__feishu-project__search_by_mql`

## 下一步建议
1. 新增 `get_workitem_info`（先查空间+工作项类型字段）
2. 再加 `workitem_list`（自动拼 MOQL）
3. 加 `workitem_update_status`（按工作项 ID 更新状态）
4. 补一批常用 MOQL 模板（按负责人、状态、时间）
