# 用户、团队与视图

## lark_project_user_get — 获取单个用户

通过 user_key、名称或邮箱精确获取单个用户详情。

```json
{
  "query": "张三"
}
```

- `query`: 必填，用户 user_key、名称或邮箱
- `project_key`: 可选，限定租户范围

**返回**：`data` 字段为用户数组（0 或 1 个元素）。

**使用场景**：
- 只有名称或邮箱时 → 用此工具获取 user_key
- 已有 user_key → 可用此工具验证用户信息

---

## lark_project_user_list — 批量查询用户详情

根据 user_key 列表查询用户详细信息。每次最多 100 个。

```json
{
  "user_keys": ["7136000000000000676", "7136015608381980677"]
}
```

**返回**：`data` 字段为用户详情数组，每项包含 `user_key`, `name`, `email`, `out_id`, `status`。

**使用场景**：已有 user_key 列表，需要批量获取用户名称、邮箱等详情。

---

## lark_project_team_list — 获取空间团队人员

获取空间下的团队列表。设置 `include_user_detail=true` 时自动补充用户详情。

```json
{
  "project_key": "openclaw",
  "include_user_detail": true
}
```

**返回**：`data` 字段为团队数组，每项包含：
- `team_id`, `team_name`
- `user_keys` — 成员 user_key 列表
- `administrators` — 管理员 user_key 列表
- `members` — 成员详情
- `user_details` — 完整用户详情（当 `include_user_detail=true`）

**可选参数**：
- `offset` — 页码，从 0 开始
- `limit` — 每页条数，最大 300
- `include_user_detail` — 默认 false

---

## lark_project_view_get — 获取视图下的工作项列表

获取指定视图中的工作项列表和每个工作项的完整详情。`view_id` 从视图页面 URL 末尾获取。

```json
{
  "project_key": "openclaw",
  "view_id": "DJ4xxxx"
}
```

**返回**：
- `data` — 含 `name`（视图名称）、`view_id`、`work_item_id_list`、`work_items`（完整详情数组）
- `pagination` — 含 `total`, `page_num`, `page_size`

**可选参数**：
- `page_num` — 页码，默认 1
- `page_size` — 每页条数，最大 200

---

## lark_project_schedule_get — 查询人员排期

获取指定空间下指定人员在指定时间区间内的个人排期与工作量明细。

```json
{
  "project_key": "openclaw",
  "start_time": "2026-03-01",
  "end_time": "2026-03-31",
  "user_keys": ["7136000000000000676"],
  "work_item_type_keys": ["_all"]
}
```

**约束**：
- 时间范围最大 3 个月（格式 `YYYY-MM-DD`）
- `user_keys` 最多 20 个

**返回**：`user_workload_list` + `total`。

**应用场景**：
- 团队人力分析
- 排期评审
- 识别超载/空闲成员
- 评估迭代与项目整体容量

**典型示例**：统计本周张三、李四、王五每个人的排期工时，谁已超过 80% 容量。

> 与 `lark_project_search_by_mql` 不同：MQL 需要精确查询语句返回工作项列表，而 `schedule_get` 可以精确查询指定用户在节点/子任务/工作项上的排期和估分数据。

---

## 标准流程

### 查询用户与团队

**只有名称或邮箱 → 精确匹配单个用户**：
```
lark_project_user_get
```

**已有 user_key → 批量查询详情**：
```
lark_project_user_list
```

**查看空间团队结构**：
```
lark_project_team_list (设置 include_user_detail=true)
```

### 查询视图工作项

```
lark_project_view_get
```

### 查询人员排期

```
lark_project_schedule_get
```

**完整示例**：查询某团队成员的本周排期

1. **获取团队成员**：
   ```json
   {
     "project_key": "openclaw",
     "include_user_detail": true
   }
   ```
   从返回中提取目标团队成员的 `user_keys`

2. **查询排期**：
   ```json
   {
     "project_key": "openclaw",
     "start_time": "2026-03-01",
     "end_time": "2026-03-07",
     "user_keys": ["7136000000000000676", "7136015608381980677"],
     "work_item_type_keys": ["_all"]
   }
   ```
