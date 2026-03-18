# 工作项操作

## lark_project_work_item_get — 获取工作项概况

获取工作项实例的所有字段、当前节点、状态、角色人员等。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123"
}
```

或

```json
{
  "project_key": "openclaw",
  "work_item_id": "6863720675"
}
```

**返回**：`data` 字段为 `WorkItem` 对象，包含：
- `id`, `name`, `work_item_type_key`
- `fields` — 字段数组
- `current_nodes` — 当前节点
- `work_item_status` — 状态
- `state_times` — 节点停留时间

---

## lark_project_work_item_create — 创建工作项

一次只能创建一条，创建成功后返回详情页 URL。`name` 为必填。

```json
{
  "project_key": "openclaw",
  "work_item_type_key": "story",
  "name": "新建需求"
}
```

**可选参数**：
- `field_value_pairs` — 初始化字段值（时间类需传 16 位毫秒时间戳，人员类用英文逗号分隔）
- `template_id` — 使用指定模板创建

**返回**：`data` 字段为新工作项 ID。

---

## lark_project_work_item_update — 更新任意字段

更新工作项的任意字段，支持批量更新。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "update_fields": [
    { "field_key": "priority", "field_value": { "label": "P0", "value": "0" } }
  ]
}
```

字段 key 和值格式可通过 `lark_project_work_item_schema_get` 获取。

### field_value 格式速查

| 字段类型 | field_value 格式 | 示例 |
|---------|-----------------|------|
| 单选（priority 等） | `{ "label": "P0", "value": "0" }` | `{ "label": "P0", "value": "0" }` |
| 业务线（business） | 业务线 ID 字符串 | `"662f0e13b1a20d5dd5fb3320"` |
| 单行文本 | 字符串 | `"文本内容"` |
| 数字 | 数值 | `11.11` |
| 单选人员 | user_key 字符串 | `"7356795280xxx"` |
| 多选人员 | user_key 字符串数组 | `["735xxx", "731xxx"]` |
| 日期 | 毫秒时间戳 | `1722182400000` |
| 描述（description） | markdown 字符串 | `"# 标题\n内容"` |

### 更新业务线的正确流程

业务线 `field_value` 必须传 **业务线 ID**，不能传名称：

1. 调用 `lark_project_business_list` 获取业务线列表
2. 找到目标业务线的 `id`
3. 用该 ID 作为 `field_value` 更新

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "update_fields": [
    { "field_key": "business", "field_value": "662f0e13b1a20d5dd5fb3320" }
  ]
}
```

---

## lark_project_work_item_abort — 终止/恢复工作项

飞书项目不提供真正的删除 API，使用终止功能替代。

**终止工作项**：

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "reason": "重复需求"
}
```

**恢复已终止的工作项**：

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "is_aborted": false,
  "reason": "误操作恢复"
}
```

- `is_aborted` 默认 `true`（终止），传 `false` 恢复

---

## lark_project_work_item_role_update — 修改角色人员

⚠️ **覆盖更新**：必须传入所有角色及其人员，未传入的角色会被清空。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "role_owners": [
    { "role": "rd", "owners": ["7136000000000000676"] },
    { "role": "PM", "owners": ["7136015608381980677"] }
  ]
}
```

**更新步骤**：
1. `lark_project_work_item_get` 读取当前角色人员
2. `lark_project_work_item_schema_get` 确认角色 ID
3. `lark_project_work_item_role_update` 提交（⚠️ 覆盖更新）
4. `lark_project_work_item_get` 回读验证

---

## lark_project_work_item_schema_get — 获取字段与角色信息

获取工作项类型的可用字段与角色信息，在更新前调用以确认 field_key 和 role ID。

```json
{
  "project_key": "openclaw",
  "work_item_type_key": "story"
}
```

**返回**：
- `fields` — 字段数组，含 `field_key`, `field_name`, `field_type_key`, `options`（仅 select 类型）
- `roles` — 角色数组，含 `id`, `name`, `is_owner`

---

## lark_project_business_list — 获取业务线列表

获取空间下所有业务线，用于更新业务线字段前查找正确的 ID。

```json
{
  "project_key": "openclaw"
}
```

**返回**：`data` 字段为业务线数组，每条包含 `id` 和 `name`。

---

## lark_project_search_by_mql — MQL 查询

使用类 SQL 语法（MOQL）查询工作项，支持复杂筛选。与精确查询不同，MQL 适合批量筛选和统计。

```json
{
  "project_key": "openclaw",
  "moql": "select `工作项id`, `名称` from `openclaw`.`需求` where `优先级` = 'P0'"
}
```

### 使用步骤

1. **理解意图** — 分析用户请求，提取空间、工作项类型
2. **确认元数据** — 用 `lark_project_work_item_schema_get` 确认字段名（使用可读名称而非 key）
3. **编写 MOQL** — 使用步骤 2 获取的友好字段名，如 `select `任务名称`` 而非 `select name`

### MOQL 语法规范

- 支持标准 MySQL 语法和函数
- 表名格式：`` `空间名`.`工作项类型` ``
- 字段名使用 `` ` ` `` 包裹的友好名称（从 schema 获取）

### 数组方法

| 方法 | 说明 | 示例 |
|-----|------|------|
| `all_match(array_col, predicate)` | 所有元素满足条件 | `all_match(ary_col, x -> x > 10)` |
| `any_match(array_col, predicate)` | 任一元素满足条件 | `any_match(`当前负责人`, x -> x in ('小李'))` |
| `none_match(array_col, predicate)` | 所有元素都不满足 | `none_match(ary_col, x -> x < 0)` |
| `array_contains(array_col, element)` | 包含指定元素 | `array_contains(__RD, '张三')` |
| `array_cardinality(array_col)` | 返回元素个数 | - |
| `array_filter(array_col, predicate)` | 过滤数组 | `array_filter(ary_col, x -> x > 100)` |

### 团队与人员方法

| 方法 | 说明 | 示例 |
|-----|------|------|
| `current_login_user()` | 当前登录用户 userkey | `current_login_user()` |
| `team(include_manager, team_name)` | 团队成员 userkey 数组 | `team(true, '后端开发团队')` |
| `participate_roles()` | 所有参与角色的 rolekey 数组 | - |
| `all_participate_persons()` | 所有参与人的 userkey 数组 | - |

### 时间判断方法

格式：`RELATIVE_DATETIME_XX(col_name, 'date_para', ['days'])`

| 方法 | 说明 |
|-----|------|
| `RELATIVE_DATETIME_EQ` | 等于相对时间 |
| `RELATIVE_DATETIME_GT` | 大于相对时间 |
| `RELATIVE_DATETIME_GE` | 大于等于相对时间 |
| `RELATIVE_DATETIME_LT` | 小于相对时间 |
| `RELATIVE_DATETIME_LE` | 小于等于相对时间 |
| `RELATIVE_DATETIME_BETWEEN` | 在相对时间范围内 |

**date_para 取值**：
- `today`, `tomorrow`, `yesterday`
- `current_week`, `next_week`, `last_week`
- `current_month`, `next_month`, `last_month`
- `future`, `past`
- 配合 `days` 参数偏移，如 `future, '3d'`

**示例**：
- `RELATIVE_DATETIME_EQ(`创建时间`, 'today')` — 今天创建
- `RELATIVE_DATETIME_EQ(`创建时间`, 'today', '3d')` — 3 天后
- `RELATIVE_DATETIME_BETWEEN(`创建时间`, 'current_week')` — 本周创建

### 角色查询

角色字段以 `__角色名` 格式查询：

```sql
-- 查询 RD 为张三的需求
SELECT `工作项id` FROM `openclaw`.`需求` WHERE array_contains(__RD, '张三')
```

### 排期字段查询

排期字段以 `__排期名称_开始/结束时间` 格式：

```sql
-- 查询开发周期在 2025-01 范围内的需求
SELECT `工作项id` FROM `openclaw`.`需求`
WHERE `__开发周期_开始时间` > '2025-01-01'
  AND `__开发周期_结束时间` < '2025-01-31'
```

### 完整示例

```sql
-- 1. 查询未冻结的需求
select `工作项id` from `测试空间`.`需求` where `是否冻结` = 0

-- 2. 名称模糊搜索
select `工作项id` from `测试空间`.`需求` where `名称` like '%a%'

-- 3. 昨天创建或未来 3 天内创建
select `工作项id` from `测试空间`.`需求`
where `创建时间` = '2020-01-01'
   OR RELATIVE_DATETIME_BETWEEN(`创建时间`, 'future', '3d')

-- 4. 当前负责人是小李或当前登录用户
select `工作项id` from `测试空间`.`需求`
where any_match(`当前负责人`, x -> x in (current_login_user(), '小李'))

-- 5. 当前负责人在团队1里或者是小王
select `工作项id` from `测试空间`.`需求`
where any_match(`当前负责人`, usr -> usr in team(true, '团队1') OR usr in ('小王'))

-- 6. 综合查询：RD是张三、昨天创建、处理人在开放平台团队、开发周期在1月内
SELECT `工作项id` FROM `openclaw`.`需求`
WHERE array_contains(__RD, '张三')
  AND RELATIVE_DATETIME_EQ(`创建时间`, 'yesterday')
  AND any_match(`处理人`, x -> x in (TEAM(true, '开放平台团队')))
  AND `__开发周期_开始时间` > '2025-01-01'
  AND `__开发周期_结束时间` < '2025-01-31'
```

### 分页查询

首次查询可不传 `group_pagination_list`，默认返回第一页（最多 50 条）。如需分页：

```json
{
  "project_key": "openclaw",
  "moql": "select `工作项id` from `openclaw`.`需求`",
  "group_pagination_list": ["...分页信息..."]
}
```

或使用返回的 `session_id` 进行分页：

```json
{
  "project_key": "openclaw",
  "session_id": "xxx"
}
```
