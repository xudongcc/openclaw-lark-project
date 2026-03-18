---
name: lark-project
description: |
  飞书项目（project.feishu.cn）工作项管理。当用户提到飞书项目、工作项、需求、缺陷、任务、project.feishu.cn 链接、MQL 查询或 Meego 数据时激活。涵盖工作项创建/更新/查询、工作流流转、评论管理、用户与团队查询等所有飞书项目操作。
---

# 飞书项目

所有操作通过 `lark_project_` 前缀的独立工具完成。

## 基本原则

1. **优先使用 `url` 入参** — 可自动解析 `project_key`、`work_item_type`、`work_item_id`。
2. **先查后改** — 更新前先 `lark_project_work_item_get` 确认当前值，更新后回读验证。
3. **不确定字段 key 时先查** — 调用 `lark_project_work_item_schema_get` 获取字段定义。

## 工具速查

| 操作场景 | 工具 |
|---------|------|
| 查询/更新工作项 | `lark_project_work_item_get` / `lark_project_work_item_update` |
| 创建工作项 | `lark_project_work_item_create` |
| MQL 查询 | `lark_project_search_by_mql` |
| 工作流/节点流转 | `lark_project_workflow_get` / `lark_project_node_confirm` / `lark_project_state_change` |
| 评论管理 | `lark_project_comment_list` / `create` / `update` / `delete` |
| 用户/团队查询 | `lark_project_user_get` / `lark_project_team_list` |
| 排期查询 | `lark_project_schedule_get` |

## 详细文档

- 工作项操作（CRUD、字段更新、业务线）→ 阅读 `references/work-item.md`
- 工作流与流转（节点流、状态流）→ 阅读 `references/workflow.md`
- 评论管理 → 阅读 `references/comment.md`
- 用户、团队、视图、排期 → 阅读 `references/user-team.md`

## 最常用工具详解

### lark_project_work_item_get — 获取工作项概况

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123"
}
```

返回：所有字段、当前节点、状态、角色人员等。

### lark_project_work_item_update — 更新字段

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "update_fields": [
    { "field_key": "priority", "field_value": { "label": "P0", "value": "0" } }
  ]
}
```

field_value 格式：
- 单选：`{ "label": "P0", "value": "0" }`
- 业务线：ID 字符串（非名称）
- 单行文本：字符串
- 数字：数值
- 单选人员：user_key 字符串
- 多选人员：`["user1", "user2"]`
- 日期：毫秒时间戳
- 描述：markdown 字符串

### lark_project_search_by_mql — MQL 查询

使用类 SQL 语法查询工作项，支持复杂筛选。

```json
{
  "project_key": "openclaw",
  "moql": "select `工作项id`, `名称` from `openclaw`.`需求` where `优先级` = 'P0'"
}
```

更多 MQL 语法 → 阅读 `references/work-item.md`

### lark_project_workflow_get — 获取工作流

执行流转前必须先调用，区分节点流和状态流：
- 节点流：`workflow_nodes`（status: 1=未到达, 2=已到达, 3=已通过）
- 状态流：`state_flow_nodes` + `connections`（含 `transition_id`）

## 标准流程速查

### 更新字段

1. `lark_project_work_item_get` 读取当前值
2. `lark_project_work_item_update` 提交修改
3. `lark_project_work_item_get` 回读验证

### 节点流转（节点流）

1. `lark_project_workflow_get` → 找 `status=2` 的节点
2. `lark_project_node_confirm` 完成，或 `lark_project_node_rollback` 回滚
3. `lark_project_workflow_get` 验证

### 状态流转（状态流）

1. `lark_project_workflow_get` → 找当前状态，从 `connections` 取 `transition_id`
2. `lark_project_state_change`（传入 `transition_id`）
3. `lark_project_workflow_get` 验证

## 插件配置

| 字段 | 说明 |
|-----|------|
| `pluginId` | 飞书项目插件 ID（格式如 `MII_*`） |
| `pluginSecret` | 飞书项目插件密钥 |
| `userKey` | 用户标识（纯数字） |
| `mcpKey` | MCP Key（格式如 `m-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`） |

## 常见报错

| 报错 | 处理 |
|-----|------|
| `can not support fields: 描述` | 用 `lark_project_work_item_update`（`field_key=description`） |
| `get plugin_access_token failed` | 检查 `pluginId` / `pluginSecret` |
| `Record not found` | `comment_id` 错误或评论已删除 |
| `permission denied` | 检查项目权限和账号租户 |
| `Node Is Not Arrived` | 节点未到达（status≠2） |
| `Required Field Is Not Set` (20038) | 流转前必填字段未填写 |
| `User Not Found` (30006) | user_key 错误或虚拟 token 限制 |
