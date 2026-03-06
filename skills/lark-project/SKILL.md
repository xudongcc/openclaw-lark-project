---
description: 管理飞书项目，通过 mcporter 调用 lark-project MCP 进行查询/创建/更新字段，通过 openclaw-lark-project 插件工具更新描述和管理评论。
---

# lark-project

管理飞书项目（project.feishu.cn）中的需求、缺陷、任务等工作项。

## 基本原则

1. **优先使用 `url` 入参** — 可自动解析 `project_key`、`work_item_type`、`work_item_id`。
2. **先查后改** — 更新前先 `get_workitem_brief` 确认当前值，更新后回读验证。
3. **不确定字段 key 时先查** — 调用 `get_workitem_info` 获取字段定义，不要盲改。
4. **批量修改、状态流转、负责人变更前先向用户确认。**

## 工具来源

本技能使用两类工具协作，MCP 工具负责主要的查询和字段更新，插件工具补充 MCP 不支持的描述更新和评论管理。

### MCP 工具（lark-project）

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

调用示例：

```bash
# 查询工作项
mcporter call lark-project.get_workitem_brief \
  --args '{"url":"https://project.feishu.cn/xxx/story/detail/123"}' \
  --output json

# 更新字段
mcporter call lark-project.update_field \
  --args '{"url":"https://project.feishu.cn/xxx/story/detail/123","fields":[{"field_key":"name","field_value":"新标题"}]}' \
  --output json
```

### 插件工具（openclaw-lark-project）

MCP `update_field` 不支持描述字段时使用，以及评论管理。

| 工具                           | 用途                          |
| ------------------------------ | ----------------------------- |
| `update_work_item_description` | 更新描述字段（支持 markdown） |
| `create_work_item_comment`     | 添加评论                      |
| `list_work_item_comments`      | 获取评论列表                  |
| `delete_work_item_comment`     | 删除评论（仅创建人可操作）    |

#### 定位工作项（所有插件工具通用）

- **方式 A（推荐）**：传 `url`，如 `https://project.feishu.cn/<project_key>/<type>/detail/<id>`
- **方式 B**：同时传 `project_key` + `work_item_type` + `work_item_id`

#### 参数

- `update_work_item_description`：必填 `description`，可选 `field_key`（默认 `"description"`）
- `create_work_item_comment`：必填 `content`
- `delete_work_item_comment`：必填 `comment_id`（通过 `list_work_item_comments` 获取）

## 标准流程

### 更新标题/字段

1. 用 URL 确认目标工作项。
2. `get_workitem_brief` 读取当前值。
3. `update_field` 提交修改。
4. `get_workitem_brief` 回读验证。

### 更新描述

1. 先尝试 MCP `update_field(field_key=description)`。
2. 若报 `can not support fields: 描述`，改用插件工具 `update_work_item_description`。
3. 回读验证描述已更新。

### 管理评论

1. `list_work_item_comments` 查看现有评论。
2. `create_work_item_comment` 添加新评论。
3. `delete_work_item_comment` 删除评论（需提供 `comment_id`）。

### 查询与排查

- 不确定字段 key → `get_workitem_info`
- 批量查找 → `search_by_mql`
- 节点问题 → `get_node_detail` / `finish_node`

## 常见报错

| 报错                                       | 处理                                                              |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `can not support fields: 描述`             | 改用 `update_work_item_description`                               |
| `get plugin_access_token failed: HTTP 400` | 检查 pluginId/pluginSecret 配置                                   |
| `Record not found`                         | comment_id 不正确或评论已被删除                                   |
| `permission denied`                        | 检查项目空间权限和账号租户                                        |
| URL 解析失败                               | 校验格式 `https://project.feishu.cn/<project>/<type>/detail/<id>` |
| 缺少参数                                   | 未提供 `url` 或不完整的三元组                                     |
