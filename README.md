# Lark Project Workitem Plugin (Scaffold)

当前是第一版架构骨架，已包含：
- `openclaw.plugin.json`（含 `configSchema` + `uiHints`）
- 必填配置：`pluginId` / `pluginSecret` / `userId`
- `pluginSecret` 已标记为敏感字段（`sensitive: true`）
- `src/index.ts` 插件入口（待补充 API 调用与工具注册）

## 下一步建议
1. 定义认证流程（如何用 pluginId/pluginSecret/userId 获取可用 token）
2. 定义 3 个核心工具：
   - `workitem_list`
   - `workitem_get`
   - `workitem_update_status`
3. 再补充字段映射（状态、负责人、优先级、截止时间）
