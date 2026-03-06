---
name: lark-project
description: |
  飞书项目（project.feishu.cn）工作项管理。当用户提到飞书项目、工作项、需求、缺陷、任务或 project.feishu.cn 链接时激活。
---

# 飞书项目工具

本技能使用两类工具协作：**MCP 工具**（通过 mcporter 调用）负责查询、创建、更新字段等主要操作；**插件工具** `lark_project` 补充 MCP 不支持的描述更新和评论管理。

## 基本原则

1. **优先使用 `url` 入参** — 可自动解析 `project_key`、`work_item_type`、`work_item_id`。
2. **先查后改** — 更新前先 `get_workitem_brief` 确认当前值，更新后回读验证。
3. **不确定字段 key 时先查** — 调用 `get_workitem_info` 获取字段定义，不要盲改。
4. **批量修改、状态流转、负责人变更前先向用户确认。**

## MCP 工具（lark-project）

通过 mcporter 调用，mcporter 配置示例（`mcporter.json`）：

```json
{
  "mcpServers": {
    "lark-project": {
      "baseUrl": "https://project.feishu.cn/mcp_server/v1?mcpKey={mcpKey}&userKey={userKey}"
    },
    "lark-project-dev-docs": {
      "baseUrl": "https://project.feishu.cn/mcp_server/knowledge?userKey={userKey}"
    }
  }
}
```

**首次使用前先获取完整的工具列表和参数 schema：**

```bash
mcporter list lark-project --schema
```

### 工具总览

| 工具                 | 用途                                   |
| -------------------- | -------------------------------------- |
| `create_workitem`    | 创建工作项实例                         |
| `get_workitem_brief` | 获取工作项概况                         |
| `get_workitem_info`  | 获取工作项类型的可用字段与角色信息     |
| `update_field`       | 修改工作项字段值（支持批量）           |
| `search_by_mql`      | 使用 MOQL 查询工作项                   |
| `get_view_detail`    | 获取指定视图内容                       |
| `get_node_detail`    | 获取节点详情（信息、子项、自定义字段） |
| `finish_node`        | 完成某个节点                           |
| `list_schedule`      | 查询人员排期与工作量明细               |

> 所有工具均支持可选的 `url` 参数，可从链接自动解析 `project_key`、`work_item_type_key`、`work_item_id` 等信息。

### 注意事项

- **描述字段限制：** `update_field` 不支持更新描述（会报 `can not support fields: 描述`），需改用插件工具 `lark_project`。
- **MOQL 查询：** 使用可读性强的中文字段名称编写查询，先调用 `get_workitem_info` 确认可用字段。
- 时间类字段需传 16 位 unix 毫秒时间戳，人员类字段需用英文逗号分隔。

## 插件工具（lark_project）

单一工具 `lark_project`，通过 `action` 字段分发四种操作，补充 MCP 不支持的功能。

### 工作项定位（所有 action 通用）

- **方式 A（推荐）**：传 `url`，如 `https://project.feishu.cn/<project_key>/<type>/detail/<id>`
- **方式 B**：同时传 `project_key` + `work_item_type` + `work_item_id`

### update_work_item_description — 更新描述

```json
{
  "action": "update_work_item_description",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "description": "# 新描述\n\nMarkdown 内容..."
}
```

可选 `field_key`（默认 `"description"`）。

### create_work_item_comment — 添加评论

```json
{
  "action": "create_work_item_comment",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "content": "评论内容"
}
```

### list_work_item_comments — 查询评论

```json
{
  "action": "list_work_item_comments",
  "url": "https://project.feishu.cn/xxx/story/detail/123"
}
```

### delete_work_item_comment — 删除评论

```json
{
  "action": "delete_work_item_comment",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "comment_id": "7xxx"
}
```

仅评论创建人可删除。通过 `list_work_item_comments` 获取 `comment_id`。

## 标准流程

### 更新标题/字段

1. 用 URL 确认目标工作项。
2. `get_workitem_brief` 读取当前值。
3. `update_field` 提交修改。
4. `get_workitem_brief` 回读验证。

### 更新描述

1. 先尝试 MCP `update_field`（`field_key=description`）。
2. 若报 `can not support fields: 描述`，改用插件工具 `lark_project`（action=`update_work_item_description`）。
3. 回读验证描述已更新。

### 管理评论

1. `list_work_item_comments` 查看现有评论。
2. `create_work_item_comment` 添加新评论。
3. `delete_work_item_comment` 删除评论（需提供 `comment_id`）。

## 插件配置

| 字段           | 说明                    |
| -------------- | ----------------------- |
| `pluginId`     | 飞书项目插件 ID         |
| `pluginSecret` | 飞书项目插件密钥        |
| `userKey`      | 用户标识（如 `ou_xxx`） |

## 常见报错

| 报错                                       | 处理                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `can not support fields: 描述`             | 改用 `lark_project`（action=`update_work_item_description`）       |
| `get plugin_access_token failed: HTTP 400` | 检查 `pluginId` / `pluginSecret` 配置                              |
| `Record not found`                         | `comment_id` 不正确或评论已被删除                                  |
| `permission denied`                        | 检查项目空间权限和账号租户                                         |
| URL 解析失败                               | 校验格式：`https://project.feishu.cn/<project>/<type>/detail/<id>` |
