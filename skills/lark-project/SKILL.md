---
name: lark-project
description: |
  飞书项目（project.feishu.cn）工作项管理。当用户提到飞书项目、工作项、需求、缺陷、任务或 project.feishu.cn 链接时激活。
---

# 飞书项目工具

所有操作通过单一插件工具 `lark_project` 完成，使用 `action` 字段选择不同操作。

## 基本原则

1. **优先使用 `url` 入参** — 可自动解析 `project_key`、`work_item_type`、`work_item_id`。
2. **先查后改** — 更新前先 `get_work_item` 确认当前值，更新后回读验证。
3. **不确定字段 key 时先查** — 调用 `get_work_item_schema` 获取字段定义和角色列表，不要盲改。
4. **MOQL 查询** — 使用中文字段名称编写查询，先通过 `get_work_item_schema` 确认可用字段。
5. **批量修改、状态流转、负责人变更前先向用户确认。**

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

**返回**：`data` 字段为评论数组，每条包含 `id`、`author`（含 `id` 和 `name`）、`content`、`created_at`、`mentions`（可选，自动提取包含 `id` 和 `name` 的 `@mentions` 数组）。

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
    { "role": "rd", "owners": ["7136000000000000676"] },
    { "role": "PM", "owners": ["7136015608381980677"] }
  ]
}
```

- 更新前先 `get_work_item` 读取当前角色列表
- 角色 ID（如 `rd`、`pm`、`qa`）可通过 `get_work_item_schema` 获取

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

字段 key 和值的格式可通过 `get_work_item_schema` 获取。

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

| 工作流类型 | 节点列表字段       | 节点 status 含义             | connections 字段                          |
| ---------- | ------------------ | ---------------------------- | ----------------------------------------- |
| **节点流** | `workflow_nodes`   | 1=未到达, 2=已到达, 3=已通过 | 节点间关系                                |
| **状态流** | `state_flow_nodes` | 2=当前状态                   | 含 `transition_id`（用于 `change_state`） |

---

### confirm_node — 完成节点（节点流）

将状态为「已到达」（status=2）的节点标记为完成。

```json
{
  "action": "confirm_node",
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

创建工作项实例，一次只能创建一条工作项实例，创建成功后，会获得对应的详情页url。`name` 为必填。

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

- `field_value_pairs` — 要创建的实例具体的字段（每项含 `field_key`、`field_value`，需注意时间类的value需要传入16位unix毫秒时间戳，人员类的value需用英文逗号区隔）
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

### get_work_item — 获取工作项实例概况

获取一个工作项实例的概况，包括所有字段、当前节点、状态等。无需传入 `work_item_type_key`，自动推断。

```json
{
  "action": "get_work_item",
  "project_key": "openclaw",
  "work_item_id": "6863720675"
}
```

**返回**：`data` 字段为 `WorkItem` 对象，包含 `id`、`name`、`work_item_type_key`、`fields`（字段数组）、`current_nodes`（当前节点）、`work_item_status`（状态）、`state_times`（节点停留时间）等。

---

### get_work_item_schema — 获取可用字段与角色信息

获取一个工作项类型具备的可用字段与角色信息。在更新字段或角色前调用以确认可用的 field_key 和 role ID。`work_item_type_key` 支持系统标识或名称，如 story、需求、issue、缺陷等。

```json
{
  "action": "get_work_item_schema",
  "project_key": "openclaw",
  "work_item_type_key": "story"
}
```

**返回**：`data` 包含：

- `fields` — 字段数组，每项含 `field_key`、`field_name`、`field_type_key`、`is_custom_field`、`options`（选项列表，仅 select 类型）
- `roles` — 角色数组，每项含 `id`、`name`、`is_owner`

---

### get_view_detail — 获取视图下的工作项列表及详情

获取指定视图中的工作项列表和每个工作项的完整详情。`view_id` 从视图页面 URL 末尾获取。

```json
{
  "action": "get_view_detail",
  "project_key": "openclaw",
  "view_id": "DJ4xxxx"
}
```

**返回**：`data` 字段包含 `name`（视图名称）、`view_id`、`work_item_id_list`、`work_items`（工作项完整详情数组，包含 `name`、`fields`、`work_item_type_key`、`current_nodes` 等）。`pagination` 字段包含 `total`、`page_num`、`page_size`。

**可选参数**：`page_num`（页码，默认 1）、`page_size`（每页条数，最大 200）。

---

### search_by_mql — MOQL 查询工作项

使用 MOQL 进行 Meego 数据的查询。MOQL 本身是 SQL 查询语言的能力扩展。

**使用步骤**：

1. **理解意图**：分析用户的自然语言请求，明确其核心目标，从中提取出空间、工作项类型两个关键信息，如果提取不到，可以追问用户
2. **确认元数据**：务必使用步骤 1 得到的空间 key、工作项类型，使用 `get_work_item_schema` 来确认要查询的空间以及工作类型，如果查不到信息，请直接报错不要继续
3. **按需查询**：select 后跟的属性不宜过多。务必使用第二个步骤里获取到的可读性强的名称去写 moql，比如可以写 `select \`任务名称\``，避免写 `select \`name\``
4. **遵循语法**：按照 moql 的语法规范来写 moql 语句

```json
{
  "action": "search_by_mql",
  "project_key": "openclaw",
  "moql": "SELECT `工作项id`, `需求名称` FROM `openclaw`.`需求` WHERE `优先级` = 'P0'"
}
```

**可选参数**：

- `moql`：MOQL 查询语句（传 `session_id` 分页查询时可不传此项）
- `session_id`：用于分页查询，从上一次请求的返回结果中获取
- `group_pagination_list`：分页信息对象数组（如 `[{"group_id": "xxx", "page_num": 2}]`），包含 `group_id` 和 `page_num`。
- `page_num`：单页快捷查询页码（从 1 开始，历史遗留简化参数，推荐使用 `group_pagination_list` 配合 `session_id` 进行准确定页分页）。

#### MOQL 语法规范

**基本语法**：支持现有的 MySQL 语法和函数。

**数组判断方法**（返回 bool）：

- `all_match(array_col, predicate)` — array 中是否所有 element 都满足条件
- `any_match(array_col, predicate)` — array 中是否有一个 element 满足条件
- `none_match(array_col, predicate)` — array 中是否所有 element 都不满足条件
- `array_contains(array_col, element)` — array 中是否包含 element

**数组数据处理**：

- `array_cardinality(array_col)` — 返回 array 元素个数（bigint）
- `array_filter(array_col, predicate)` — 过滤 array，返回新数组

**团队与人员方法**：

- `current_login_user()` — 当前登录用户，返回 userkey
- `team(include_manager, team_name)` — 返回团队成员 userkey 数组。举例：`team(true, '后端开发团队')`
- `participate_roles()` — 返回所有参与角色的 rolekey 数组
- `all_participate_persons()` — 返回所有参与人的 userkey 数组

**时间判断方法**（返回 bool）：

- `date_para` 可选值：`today` / `tomorrow` / `yesterday` / `current_week` / `next_week` / `last_week` / `current_month` / `next_month` / `last_month` / `future` / `past`
- `days`：可选偏移天数（仅 future、past、today 时有效）
- `RELATIVE_DATETIME_EQ(col, 'date_para', ['days'])` — 等于特定相对时间
- `RELATIVE_DATETIME_GT/GE/LT/LE/BETWEEN` — 大于/大于等于/小于/小于等于/属于

**特殊格式**：

- 排期字段：`` `__排期名_开始时间` ``、`` `__排期名_结束时间` ``
- 角色查询：`array_contains(__角色名, '人员')`（带 `__` 前缀）

#### MOQL 查询示例

| 场景         | MOQL                                                                                            |
| ------------ | ----------------------------------------------------------------------------------------------- |
| 未冻结的需求 | `select \`工作项id\` from \`空间\`.\`需求\` where \`是否冻结\` = 0`                             |
| 名称模糊匹配 | `select \`工作项id\` from \`空间\`.\`需求\` where \`名称\` like '%a%'`                          |
| 负责人匹配   | `... where any_match(\`当前负责人\`, x -> x in (current_login_user(), '小李'))`                 |
| 团队成员匹配 | `... where any_match(\`当前负责人\`, usr -> usr in team(true, '团队1'))`                        |
| 排期时间范围 | `... WHERE \`**开发周期\_开始时间\` > '2025-01-01' AND \`**开发周期\_结束时间\` < '2025-01-31'` |
| 角色查询     | `... WHERE array_contains(__RD, '张三')`                                                        |

---

### list_schedule — 查询人员排期

获取指定空间下指定人员在指定时间区间内的个人排期与工作量明细，支持多用户、多工作项类型聚合展示。

**应用场景**：团队人力分析、排期评审、识别超载/空闲成员、评估迭代与项目整体容量。与 `search_by_mql` 需要精确入参查询语句才能返回工作项列表不同，本工具可以精确查询指定用户在节点/子任务/工作项上的排期和估分数据。

```json
{
  "action": "list_schedule",
  "project_key": "openclaw",
  "start_time": "2026-03-01",
  "end_time": "2026-03-31",
  "user_keys": ["7136000000000000676"],
  "work_item_type_keys": ["_all"]
}
```

**返回**：`user_workload_list` + `total`，其中每个用户包含：

- 基础信息（名称、id、邮箱）
- 排期任务明细（含状态、节点、子任务时间等）
- 总估分、未排期任务数量等汇总字段

**约束**：时间范围最大 3 个月（格式 `YYYY-MM-DD`），`user_ids` 最多 20 个（支持输入名称、邮箱、id）。

---

### get_users_by_ids — 批量查询用户详情

根据 id 列表查询用户详细信息。每次最多 100 个。

```json
{
  "action": "get_users_by_ids",
  "ids": ["7136000000000000676", "7136015608381980677"]
}
```

**返回**：`data` 字段为用户详情数组，每项包含：

| 字段     | 说明                                                |
| -------- | --------------------------------------------------- |
| `id`     | 用户唯一标识                                        |
| `name`   | 用户名称                                            |
| `email`  | 邮箱                                                |
| `out_id` | 飞书开放平台 union_id                               |
| `status` | 状态：`activated`/`resigned`/`frozen`/`initialized` |

---

### get_user — 获取单个用户

通过名称、邮箱或用户 ID 获取单个用户详情。推荐在解析 `@mentions` 或需要精确匹配单个用户时使用此接口。

```json
{
  "action": "get_user",
  "query": "张三",
  "project_key": "data5"
}
```

- `query`: 必填，要查找的用户名称、邮箱或用户 ID。
- `project_key`: 可选，传入空间 ID 以限制在特定租户内搜索。

**返回**：`data` 字段为包含命中用户的数组（0 或 1 个元素，结构同 `get_users_by_ids`）。

---

### list_teams — 获取空间团队人员

获取空间下的团队列表。设置 `include_user_detail=true` 时自动调用 `get_users_by_ids` 补充用户详情。

```json
{
  "action": "list_teams",
  "project_key": "openclaw",
  "include_user_detail": true
}
```

**返回**：`data` 字段为团队数组，每项包含：

| 字段             | 说明                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `team_id`        | 团队 ID                                                                |
| `team_name`      | 团队名称                                                               |
| `user_ids`       | 人员 id 列表                                                           |
| `administrators` | 管理员 id 列表                                                         |
| `members`        | 成员 id 列表                                                           |
| `user_details`   | `Record<string, UserDetail>`（仅 `include_user_detail=true` 时填充）   |

**可选参数**：`offset`（页码，从 0 开始）、`limit`（每页条数，最大 300）、`include_user_detail`（是否包含用户详情，默认 false）。

---

## 标准流程

### 更新字段

1. 用 URL 确认目标工作项
2. `get_work_item` 读取当前值
3. `lark_project`（action=`update_work_item_field`）提交修改
4. `get_work_item` 回读验证

### 更新业务线

1. `list_businesses` 获取空间下业务线列表 → 找到目标 ID
2. `get_work_item` 读取当前值
3. `update_work_item_field`（`field_key=business`，`field_value=业务线ID`）
4. `get_work_item` 回读验证

### 管理评论

1. `list_work_item_comments` 查看现有评论
2. `create_work_item_comment` 添加新评论
3. `delete_work_item_comment` 删除评论（需提供 `comment_id`）

### 修改角色人员

1. `get_work_item` 读取当前角色人员
2. `get_work_item_schema` 确认角色 ID
3. `update_work_item_role_owners` 提交修改（⚠️ 覆盖更新）
4. `get_work_item` 回读验证

### 节点流转（节点流）

1. `get_work_item_workflow` → 从 `workflow_nodes` 找到 `status=2` 的节点
2. `confirm_node` 完成节点，或 `rollback_node` 回滚
3. `get_work_item_workflow` 回读验证

### 状态流转（状态流）

1. `get_work_item_workflow` → 从 `state_flow_nodes` 找 `status=2`，从 `connections` 找 `transition_id`
2. `change_state`（传入 `transition_id`）
3. `get_work_item_workflow` 回读验证

### 查询用户与团队

1. 已有 `id` → `get_users_by_ids` 获取用户详情（姓名、邮箱等）
2. 查看空间团队 → `list_teams` 返回团队列表及用户详情
3. `list_teams` 返回的 `user_details` 已自动填充，无需额外调用 `get_users_by_ids`

## 插件配置

| 字段           | 说明                                                       |
| -------------- | ---------------------------------------------------------- |
| `pluginId`     | 飞书项目插件 ID（格式如 `MII_*`）                          |
| `pluginSecret` | 飞书项目插件密钥                                           |
| `userKey`      | 用户标识（纯数字，如 `7136000000000000676`）               |
| `mcpKey`       | MCP Key（格式如 `m-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`） |

## 常见报错

| 报错                                       | 处理                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `can not support fields: 描述`             | 使用插件 `lark_project`（`update_work_item_field`，`field_key=description`） |
| `get plugin_access_token failed: HTTP 400` | 检查 `pluginId` / `pluginSecret` 配置                                        |
| `Record not found`                         | `comment_id` 不正确或评论已被删除                                            |
| `permission denied`                        | 检查项目空间权限和账号租户                                                   |
| URL 解析失败                               | 校验格式：`https://project.feishu.cn/<project>/<type>/detail/<id>`           |
| `Node Is Not Arrived`                      | 节点未到达（status≠2），无法操作                                             |
| `Node Is Completed`                        | 节点已完成（status=3），无法再次完成                                         |
| `Required Field Is Not Set` (20038)        | 流转前必填字段未填写（如负责人、排期），先补充必填信息                       |
| `User Not Found` (30006)                   | id 不正确；或使用虚拟 token 时只能查插件协作者                               |
