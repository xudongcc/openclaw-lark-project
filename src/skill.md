# lark-project-workitem-description

目标：作为 `lark-project` MCP 的补充能力，稳定更新工作项描述字段。

## 推荐调用流程
1. 明确目标工作项（优先让用户提供详情页 `url`）。
2. 准备完整描述文本（支持 markdown）。
3. 调用 `update_workitem_description` 写入描述。
4. （可选）再调用官方 MCP `get_workitem_brief` 回读 `描述` 字段做校验。

## 工具
- `update_workitem_description`

### 必填参数
- `description`

### 定位工作项（两种方式二选一）
- 方式 A（推荐）：传 `url`
- 方式 B：同时传 `project_key` + `work_item_type`(或 `work_item_type_key`) + `work_item_id`

## 错误排查
- 报缺少参数：检查是否提供了 url 或完整三元组。
- 报权限错误：检查插件权限是否具备工作项写权限。
- 报字段不支持：确认空间中描述字段 key 是否不是 `description`，必要时传 `field_key`。
