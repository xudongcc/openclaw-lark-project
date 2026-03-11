---
name: lark-project
description: |
  飞书项目（project.feishu.cn）工作项管理。当用户提到飞书项目、工作项、需求、缺陷、任务或 project.feishu.cn 链接时激活。
---

# 飞书项目工具

所有操作通过 `lark_project_` 前缀的独立工具完成。工具命名规则：`lark_project_{资源}_{动作}`。

## 基本原则

1. **优先使用 `url` 入参** — 可自动解析 `project_key`、`work_item_type`、`work_item_id`。
2. **先查后改** — 更新前先 `lark_project_work_item_get` 确认当前值，更新后回读验证。
3. **不确定字段 key 时先查** — 调用 `lark_project_work_item_schema_get` 获取字段定义和角色列表，不要盲改。

## 工具列表

### 工作项定位（通用参数）

所有工作项相关工具都支持以下两种定位方式：

- **方式 A（推荐）**：传 `url`，如 `https://project.feishu.cn/<project_key>/<type>/detail/<id>`
- **方式 B**：同时传 `project_key` + `work_item_type`（或 `work_item_type_key`）+ `work_item_id`

---

### lark_project_comment_create — 添加评论

在工作项下添加一条纯文本评论。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "content": "评论内容（纯文本，不支持 markdown）"
}
```

**返回**：`data` 字段为新评论 ID。

---

### lark_project_comment_list — 查询评论

获取工作项的所有评论列表。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123"
}
```

**返回**：`data` 字段为评论数组，每条包含 `id`、`author`（含 `id` 和 `name`）、`content`、`created_at`、`is_mine`、`can_update`、`can_delete`、`mentions`（可选）。

---

### lark_project_comment_update — 更新评论

更新指定评论。仅评论的原始创建人可操作。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "comment_id": "7xxx",
  "content": "新的评论内容"
}
```

---

### lark_project_comment_delete — 删除评论

仅评论创建人可删除。`comment_id` 通过 `lark_project_comment_list` 获取。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "comment_id": "7xxx"
}
```

---

### lark_project_work_item_role_update — 修改角色人员

⚠️ **覆盖更新**：必须传入所有角色及其人员，未传入的角色人员会被清空。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "role_owners": [
    { "role": "rd", "owners": ["7136000000000000676"] },
    { "role": "PM", "owners": ["7136015608381980677"] }
  ]
}
```

- 更新前先 `lark_project_work_item_get` 读取当前角色列表
- 角色 ID（如 `rd`、`pm`、`qa`）可通过 `lark_project_work_item_schema_get` 获取

---

### lark_project_work_item_update — 更新任意字段

更新工作项的任意字段。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "update_fields": [
    { "field_key": "priority", "field_value": { "label": "P0", "value": "0" } }
  ]
}
```

字段 key 和值的格式可通过 `lark_project_work_item_schema_get` 获取。

#### field_value 格式速查

| 字段类型            | field_value 格式                              | 示例                              |
| ------------------- | --------------------------------------------- | --------------------------------- |
| 单选（priority 等） | `{ "label": "P0", "value": "0" }`             | `{ "label": "P0", "value": "0" }` |
| 业务线（business）  | 业务线 ID 字符串（**必须传 ID，不能传名称**） | `"662f0e13b1a20d5dd5fb3320"`      |
| 单行文本            | 字符串                                        | `"文本内容"`                      |
| 数字                | 数值                                          | `11.11`                           |
| 单选人员            | id 字符串                                     | `"7356795280xxx"`                 |
| 多选人员            | id 字符串数组                                 | `["735xxx", "731xxx"]`            |
| 日期                | 毫秒时间戳                                    | `1722182400000`                   |
| 描述（description） | markdown 字符串                               | `"# 标题\n内容"`                  |

#### 更新业务线的正确流程

业务线 `field_value` 必须传 **业务线 ID**（通过 `lark_project_business_list` 获取），不能传名称：

1. 调用 `lark_project_business_list` 获取空间下所有业务线的 `id` 和 `name`
2. 从返回结果中找到目标业务线的 `id`
3. 用该 ID 作为 `field_value` 更新

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "update_fields": [
    { "field_key": "business", "field_value": "662f0e13b1a20d5dd5fb3320" }
  ]
}
```

---

### lark_project_business_list — 获取业务线列表

获取指定空间下所有业务线，用于更新业务线字段前查找正确的 ID。

```json
{
  "project_key": "openclaw"
}
```

**返回**：`data` 字段为业务线数组，每条包含 `id` 和 `name`。

---

### lark_project_workflow_get — 获取工作流详情

获取工作项的工作流信息，自动区分节点流和状态流。**在执行 `lark_project_node_confirm` / `lark_project_node_rollback` 或 `lark_project_state_change` 前必须先调用此工具。**

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123"
}
```

**返回结构（按工作流类型）**：

| 工作流类型 | 节点列表字段       | 节点 status 含义             | connections 字段                                       |
| ---------- | ------------------ | ---------------------------- | ------------------------------------------------------ |
| **节点流** | `workflow_nodes`   | 1=未到达, 2=已到达, 3=已通过 | 节点间关系                                             |
| **状态流** | `state_flow_nodes` | 2=当前状态                   | 含 `transition_id`（用于 `lark_project_state_change`） |

---

### lark_project_node_confirm — 完成节点（节点流）

将状态为「已到达」（status=2）的节点标记为完成。

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "node_id": "doing",
  "node_owners": ["7136000000000000676"]
}
```

**前置条件**：

- 目标节点 `status` 必须为 `2`（已到达）
- 建议传入 `node_owners`（节点负责人）

**可选参数**：`node_schedule`（排期）、`fields`（表单字段）、`role_assignee`（角色负责人）。

> **注意**：流转前需确保必填信息已填写，否则会报错 `20038 Required Field Is Not Set`。

---

### lark_project_node_rollback — 回滚节点（节点流）

将已完成的节点回滚到「已到达」状态。

```json
{
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

### lark_project_state_change — 状态流转（状态流）

执行状态流工作项的状态流转。

```json
{
  "url": "https://project.feishu.cn/xxx/issue/detail/456",
  "transition_id": "transition_xxx"
}
```

**获取 `transition_id` 的步骤**：

1. 调用 `lark_project_workflow_get`
2. 从 `state_flow_nodes` 找到 `status=2` 的当前状态
3. 从 `connections` 找 `source_state_key` 匹配当前状态的 `transition_id`

**可选参数**：`fields`（表单字段）、`role_owners`（角色人员）。

---

### lark_project_work_item_create — 创建工作项

创建工作项实例，一次只能创建一条工作项实例，创建成功后，会获得对应的详情页url。`name` 为必填。

```json
{
  "project_key": "openclaw",
  "work_item_type_key": "story",
  "name": "新建需求"
}
```

**返回**：`data` 字段为新工作项 ID。

**可选参数**：

- `field_value_pairs` — 要创建的实例具体的字段（每项含 `field_key`、`field_value`，需注意时间类的value需要传入16位unix毫秒时间戳，人员类的value需用英文逗号区隔）
- `template_id` — 使用指定模板创建

---

### lark_project_work_item_abort — 终止/恢复工作项

终止不需要的工作项（默认），或恢复已终止的工作项。飞书项目不提供真正的删除 API。

终止：

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "reason": "重复需求"
}
```

恢复已终止的工作项：

```json
{
  "url": "https://project.feishu.cn/xxx/story/detail/123",
  "is_aborted": false,
  "reason": "误操作恢复"
}
```

- `is_aborted` 默认 `true`（终止），传 `false` 恢复

---

### lark_project_work_item_get — 获取工作项实例概况

获取一个工作项实例的概况，包括所有字段、当前节点、状态等。无需传入 `work_item_type_key`，自动推断。

```json
{
  "project_key": "openclaw",
  "work_item_id": "6863720675"
}
```

**返回**：`data` 字段为 `WorkItem` 对象，包含 `id`、`name`、`work_item_type_key`、`fields`（字段数组）、`current_nodes`（当前节点）、`work_item_status`（状态）、`state_times`（节点停留时间）等。

---

### lark_project_work_item_schema_get — 获取可用字段与角色信息

获取一个工作项类型具备的可用字段与角色信息。在更新字段或角色前调用以确认可用的 field_key 和 role ID。

```json
{
  "project_key": "openclaw",
  "work_item_type_key": "story"
}
```

**返回**：`data` 包含：

- `fields` — 字段数组，每项含 `field_key`、`field_name`、`field_type_key`、`is_custom_field`、`options`（选项列表，仅 select 类型）
- `roles` — 角色数组，每项含 `id`、`name`、`is_owner`

---

### lark_project_view_get — 获取视图下的工作项列表及详情

获取指定视图中的工作项列表和每个工作项的完整详情。`view_id` 从视图页面 URL 末尾获取。

```json
{
  "project_key": "openclaw",
  "view_id": "DJ4xxxx"
}
```

**返回**：`data` 字段包含 `name`（视图名称）、`view_id`、`work_item_id_list`、`work_items`（工作项完整详情数组）。`pagination` 字段包含 `total`、`page_num`、`page_size`。

**可选参数**：`page_num`（页码，默认 1）、`page_size`（每页条数，最大 200）。

---

### lark_project_schedule_get — 查询人员排期

获取指定空间下指定人员在指定时间区间内的个人排期与工作量明细。

```json
{
  "project_key": "openclaw",
  "start_time": "2026-03-01",
  "end_time": "2026-03-31",
  "user_ids": ["7136000000000000676"],
  "work_item_type_keys": ["_all"]
}
```

**返回**：`user_workload_list` + `total`。

**约束**：时间范围最大 3 个月（格式 `YYYY-MM-DD`），`user_ids` 最多 20 个。

---

### lark_project_user_list — 批量查询用户详情

根据 id 列表查询用户详细信息。每次最多 100 个。

```json
{
  "ids": ["7136000000000000676", "7136015608381980677"]
}
```

**返回**：`data` 字段为用户详情数组，每项包含 `id`、`name`、`email`、`out_id`、`status`。

---

### lark_project_user_get — 获取单个用户

通过 ID、名称或邮箱精确获取单个用户详情。

```json
{
  "query": "张三"
}
```

- `query`: 必填，用户 ID、名称或邮箱
- `project_key`: 可选，限定租户范围

**返回**：`data` 字段为用户数组（0 或 1 个元素）。

---

### lark_project_team_list — 获取空间团队人员

获取空间下的团队列表。设置 `include_user_detail=true` 时自动补充用户详情。

```json
{
  "project_key": "openclaw",
  "include_user_detail": true
}
```

**返回**：`data` 字段为团队数组，每项包含 `team_id`、`team_name`、`user_ids`、`administrators`、`members`、`user_details`。

**可选参数**：`offset`（页码，从 0 开始）、`limit`（每页条数，最大 300）、`include_user_detail`（默认 false）。

---

## 标准流程

### 更新字段

1. 用 URL 确认目标工作项
2. `lark_project_work_item_get` 读取当前值
3. `lark_project_work_item_update` 提交修改
4. `lark_project_work_item_get` 回读验证

### 更新业务线

1. `lark_project_business_list` 获取空间下业务线列表 → 找到目标 ID
2. `lark_project_work_item_get` 读取当前值
3. `lark_project_work_item_update`（`field_key=business`，`field_value=业务线ID`）
4. `lark_project_work_item_get` 回读验证

### 管理评论

1. `lark_project_comment_list` 查看现有评论
2. `lark_project_comment_create` 添加新评论
3. `lark_project_comment_update` 更新评论
4. `lark_project_comment_delete` 删除评论

### 修改角色人员

1. `lark_project_work_item_get` 读取当前角色人员
2. `lark_project_work_item_schema_get` 确认角色 ID
3. `lark_project_work_item_role_update` 提交修改（⚠️ 覆盖更新）
4. `lark_project_work_item_get` 回读验证

### 节点流转（节点流）

1. `lark_project_workflow_get` → 从 `workflow_nodes` 找到 `status=2` 的节点
2. `lark_project_node_confirm` 完成节点，或 `lark_project_node_rollback` 回滚
3. `lark_project_workflow_get` 回读验证

### 状态流转（状态流）

1. `lark_project_workflow_get` → 从 `state_flow_nodes` 找 `status=2`，从 `connections` 找 `transition_id`
2. `lark_project_state_change`（传入 `transition_id`）
3. `lark_project_workflow_get` 回读验证

### 查询用户与团队

1. 只有名称或邮箱 → `lark_project_user_get`（精确匹配单个用户）
2. 已有 `id` → `lark_project_user_get` 或 `lark_project_user_list`（批量查询）
3. 查看空间团队 → `lark_project_team_list`

## 插件配置

| 字段           | 说明                                                       |
| -------------- | ---------------------------------------------------------- |
| `pluginId`     | 飞书项目插件 ID（格式如 `MII_*`）                          |
| `pluginSecret` | 飞书项目插件密钥                                           |
| `userKey`      | 用户标识（纯数字，如 `7136000000000000676`）               |
| `mcpKey`       | MCP Key（格式如 `m-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`） |

## 常见报错

| 报错                                       | 处理                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `can not support fields: 描述`             | 使用 `lark_project_work_item_update`（`field_key=description`）    |
| `get plugin_access_token failed: HTTP 400` | 检查 `pluginId` / `pluginSecret` 配置                              |
| `Record not found`                         | `comment_id` 不正确或评论已被删除                                  |
| `permission denied`                        | 检查项目空间权限和账号租户                                         |
| URL 解析失败                               | 校验格式：`https://project.feishu.cn/<project>/<type>/detail/<id>` |
| `Node Is Not Arrived`                      | 节点未到达（status≠2），无法操作                                   |
| `Node Is Completed`                        | 节点已完成（status=3），无法再次完成                               |
| `Required Field Is Not Set` (20038)        | 流转前必填字段未填写，先补充必填信息                               |
| `User Not Found` (30006)                   | id 不正确；或使用虚拟 token 时只能查插件协作者                     |
