---
name: lark-project
description: |
  飞书项目（project.feishu.cn）工作项管理。当用户提到飞书项目、工作项、需求、缺陷、任务或 project.feishu.cn 链接时激活。
---

# 飞书项目工具

本技能使用两类工具协作：

| 操作类型 | 使用工具 |
| -------- | -------- |
| 查询工作项、字段定义、视图、排期 | **MCP 工具**（通过 mcporter 调用） |
| 更新字段、修改描述/业务线/优先级、管理评论、角色人员、工作流流转、创建/终止工作项 | **插件工具** `lark_project` |

## 基本原则

1. **优先使用 `url` 入参** — 可自动解析 `project_key`、`work_item_type`、`work_item_id`。
2. **先查后改** — 更新前先 `get_workitem_brief` 确认当前值，更新后回读验证。
3. **不确定字段 key 时先查** — 调用 `get_workitem_info` 获取字段定义和角色列表，不要盲改。
4. **批量修改、状态流转、负责人变更前先向用户确认。**

## MCP 工具（lark-project）

通过 mcporter 调用。**首次使用前先获取完整的工具列表和参数 schema：**

```bash
mcporter list lark-project --schema
```

### 工具总览

| 工具 | 用途 | 典型场景 |
| ---- | ---- | -------- |
| `get_workitem_brief` | 获取工作项概况（字段值、角色人员） | 更新前确认当前值、更新后回读验证 |
| `get_workitem_info` | 获取工作项类型的可用字段与角色信息 | 不确定 field_key 或 role ID 时查询 |
| `search_by_mql` | 使用 MOQL 查询工作项列表 | 按条件筛选工作项 |
| `get_view_detail` | 获取指定视图内容 | 查看看板/列表视图 |
| `get_node_detail` | 获取节点详情（子项、自定义字段） | 查看节点级别信息 |
| `list_schedule` | 查询人员排期与工作量明细 | 团队人力分析、排期评审 |

> 所有工具均支持可选的 `url` 参数，可自动解析 `project_key`、`work_item_type_key`、`work_item_id`。

### 注意事项

- **MCP 仅用于查询和读操作。** 所有写操作均使用插件工具 `lark_project`。
- **MOQL 查询：** 使用可读性强的中文字段名称编写查询，先调用 `get_workitem_info` 确认可用字段。
- 时间类字段需传 16 位 unix 毫秒时间戳，人员类字段需用英文逗号分隔。

## 插件工具（lark_project）

单一工具 `lark_project`，通过 `action` 字段选择不同操作。

### 工作项定位（通用参数）

所有 action 都支持以下两种定位方式：

- **方式 A（推荐）**：传 `url`，如 `https://project.feishu.cn/<project_key>/<type>/detail/<id>`
- **方式 B**：同时传 `project_key` + `work_item_type`（或 `work_item_type_key`）+ `work_item_id`

---

### create_work_item_comment — 添加评论

在工作项下添加一条纯文本评论。

```json
{
  "action": "create_work_item_comment",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "content": "评论内容（纯文本，不支持 markdown）"
}
```

**返回**：`data` 字段为新评论 ID。

---

### list_work_item_comments — 查询评论

获取工作项的所有评论列表。

```json
{
  "action": "list_work_item_comments",
  "url": "https://project.feishu.cn/xxx/story/detail/123"
}
```

**返回**：`data` 字段为评论数组，每条包含 `id`、`content`、`creator`、`created_at` 等。

---

### delete_work_item_comment — 删除评论

仅评论创建人可删除。`comment_id` 通过 `list_work_item_comments` 获取。

```json
{
  "action": "delete_work_item_comment",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "comment_id": "7xxx"
}
```

---

### update_work_item_role_owners — 修改角色人员

⚠️ **覆盖更新**：必须传入所有角色及其人员，未传入的角色人员会被清空。

```json
{
  "action": "update_work_item_role_owners",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "role_owners": [
    { "role": "rd", "owners": ["ou_xxx"] },
    { "role": "PM", "owners": ["ou_yyy"] }
  ]
}
```

- 更新前先 `get_workitem_brief` 读取当前角色列表
- 角色 ID（如 `rd`、`pm`、`qa`）可通过 MCP `get_workitem_info` 获取

---

### update_work_item_field — 更新任意字段

更新工作项的任意字段。适用于 MCP `update_field` 不支持的字段（如 `description`、`business` 等）。

```json
{
  "action": "update_work_item_field",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "update_fields": [
    { "field_key": "priority", "field_value": { "label": "P0", "value": "0" } }
  ]
}
```

字段 key 和值的格式可通过 MCP `get_workitem_info` 获取。

#### field_value 格式速查

| 字段类型 | field_value 格式 | 示例 |
| -------- | ---------------- | ---- |
| 单选（priority 等） | `{ "label": "P0", "value": "0" }` | `{ "label": "P0", "value": "0" }` |
| 业务线（business） | 业务线 ID 字符串（**必须传 ID，不能传名称**） | `"662f0e13b1a20d5dd5fb3320"` |
| 单行文本 | 字符串 | `"文本内容"` |
| 数字 | 数值 | `11.11` |
| 单选人员 | user_key 字符串 | `"7356795280xxx"` |
| 多选人员 | user_key 字符串数组 | `["735xxx", "731xxx"]` |
| 日期 | 毫秒时间戳 | `1722182400000` |
| 描述（description） | markdown 字符串 | `"# 标题\n内容"` |

#### 更新业务线的正确流程

业务线 `field_value` 必须传 **业务线 ID**（通过 `list_businesses` 获取），不能传名称：

1. 调用 `list_businesses` 获取空间下所有业务线的 `id` 和 `name`
2. 从返回结果中找到目标业务线的 `id`
3. 用该 ID 作为 `field_value` 更新

```json
{
  "action": "update_work_item_field",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "update_fields": [
    { "field_key": "business", "field_value": "662f0e13b1a20d5dd5fb3320" }
  ]
}
```

---

### list_businesses — 获取业务线列表

获取指定空间下所有业务线，用于更新业务线字段前查找正确的 ID。

```json
{
  "action": "list_businesses",
  "project_key": "openclaw"
}
```

**返回**：`data` 字段为业务线数组，每条包含 `id` 和 `name`。

---

### get_work_item_workflow — 获取工作流详情

获取工作项的工作流信息，自动区分节点流和状态流。**在执行 `operate_node` 或 `change_state` 前必须先调用此接口。**

```json
{
  "action": "get_work_item_workflow",
  "url": "https://project.feishu.cn/xxx/story/detail/123"
}
```

**返回结构（按工作流类型）**：

| 工作流类型 | 节点列表字段 | 节点 status 含义 | connections 字段 |
| ---------- | ------------ | ---------------- | ---------------- |
| **节点流** | `workflow_nodes` | 1=未到达, 2=已到达, 3=已通过 | 节点间关系 |
| **状态流** | `state_flow_nodes` | 2=当前状态 | 含 `transition_id`（用于 `change_state`） |

---

### confirm_node — 完成节点（节点流）

将状态为「已到达」（status=2）的节点标记为完成。

```json
{
  "action": "confirm_node",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "node_id": "doing",
  "node_owners": ["ou_xxx"]
}
```

**前置条件**：
- 目标节点 `status` 必须为 `2`（已到达）
- 建议传入 `node_owners`（节点负责人）

**可选参数**：`node_schedule`（排期）、`fields`（表单字段）、`role_assignee`（角色负责人）。

> **注意**：流转前需确保必填信息已填写，否则会报错 `20038 Required Field Is Not Set`。

---

### rollback_node — 回滚节点（节点流）

将已完成的节点回滚到「已到达」状态。

```json
{
  "action": "rollback_node",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "node_id": "doing",
  "rollback_reason": "需求变更，重新评审"
}
```

**前置条件**：
- 目标节点 `status` 必须为 `3`（已通过）
- `rollback_reason` 必填

> **注意**：流转前需确保必填信息已填写，否则会报错 `20038 Required Field Is Not Set`。

---

### change_state — 状态流转（状态流）

执行状态流工作项的状态流转。

```json
{
  "action": "change_state",
  "url": "https://project.feishu.cn/xxx/issue/detail/456",
  "transition_id": "transition_xxx"
}
```

**获取 `transition_id` 的步骤**：

1. 调用 `get_work_item_workflow`
2. 从 `state_flow_nodes` 找到 `status=2` 的当前状态
3. 从 `connections` 找 `source_state_key` 匹配当前状态的 `transition_id`

**可选参数**：`fields`（表单字段）、`role_owners`（角色人员）。

---

### create_work_item — 创建工作项

在指定空间和工作项类型下创建新实例。`name` 为必填。

```json
{
  "action": "create_work_item",
  "project_key": "openclaw",
  "work_item_type_key": "story",
  "name": "新建需求"
}
```

**返回**：`data` 字段为新工作项 ID。

**可选参数**：
- `field_value_pairs` — 设置初始字段值（每项含 `field_key`、`field_value`、可选 `field_type_key`）
- `template_id` — 使用指定模板创建

---

### abort_work_item — 终止/恢复工作项

终止不需要的工作项（默认），或恢复已终止的工作项。飞书项目不提供真正的删除 API。

终止：
```json
{
  "action": "abort_work_item",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "reason": "重复需求"
}
```

恢复已终止的工作项：
```json
{
  "action": "abort_work_item",
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "is_aborted": false,
  "reason": "误操作恢复"
}
```

- `is_aborted` 默认 `true`（终止），传 `false` 恢复

---

## 标准流程

### 更新字段

1. 用 URL 确认目标工作项
2. `get_workitem_brief` 读取当前值
3. `lark_project`（action=`update_work_item_field`）提交修改
4. `get_workitem_brief` 回读验证

### 更新业务线

1. `list_businesses` 获取空间下业务线列表 → 找到目标 ID
2. `get_workitem_brief` 读取当前值
3. `update_work_item_field`（`field_key=business`，`field_value=业务线ID`）
4. `get_workitem_brief` 回读验证

### 管理评论

1. `list_work_item_comments` 查看现有评论
2. `create_work_item_comment` 添加新评论
3. `delete_work_item_comment` 删除评论（需提供 `comment_id`）

### 修改角色人员

1. `get_workitem_brief` 读取当前角色人员
2. `get_workitem_info` 确认角色 ID
3. `update_work_item_role_owners` 提交修改（⚠️ 覆盖更新）
4. `get_workitem_brief` 回读验证

### 节点流转（节点流）

1. `get_work_item_workflow` → 从 `workflow_nodes` 找到 `status=2` 的节点
2. `confirm_node` 完成节点，或 `rollback_node` 回滚
3. `get_work_item_workflow` 回读验证

### 状态流转（状态流）

1. `get_work_item_workflow` → 从 `state_flow_nodes` 找 `status=2`，从 `connections` 找 `transition_id`
2. `change_state`（传入 `transition_id`）
3. `get_work_item_workflow` 回读验证

## 插件配置

| 字段 | 说明 |
| ---- | ---- |
| `pluginId` | 飞书项目插件 ID（格式如 `MII_*`） |
| `pluginSecret` | 飞书项目插件密钥 |
| `userKey` | 用户标识（如 `ou_xxx`） |

## 常见报错

| 报错 | 处理 |
| ---- | ---- |
| `can not support fields: 描述` | 使用插件 `lark_project`（`update_work_item_field`，`field_key=description`） |
| `get plugin_access_token failed: HTTP 400` | 检查 `pluginId` / `pluginSecret` 配置 |
| `Record not found` | `comment_id` 不正确或评论已被删除 |
| `permission denied` | 检查项目空间权限和账号租户 |
| URL 解析失败 | 校验格式：`https://project.feishu.cn/<project>/<type>/detail/<id>` |
| `Node Is Not Arrived` | 节点未到达（status≠2），无法操作 |
| `Node Is Completed` | 节点已完成（status=3），无法再次完成 |
| `Required Field Is Not Set` (20038) | 流转前必填字段未填写（如负责人、排期），先补充必填信息 |
