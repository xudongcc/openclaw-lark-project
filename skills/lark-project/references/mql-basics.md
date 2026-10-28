# MQL 基础语法与硬规则

目录：1 语句形态 · 2 标识符与字符串 · 3 禁用语法 · 4 不可查询字段类型 · 5 字段名易错映射 · 6 枚举值 · 7 LIKE 转义 · 8 多值右值 · 9 数据类型 · 10 安全传参

## 1. 语句形态

```sql
SELECT fieldList FROM `project_key`.`work_item_type_key` [WHERE cond] [ORDER BY field [ASC|DESC]] [LIMIT n]
-- 字段列表禁 *；FROM 必须双段完整；单次最多 50 条，LIMIT n 只截断（n ≤ 50）不翻页，翻页用 session_id + group_pagination_list
```

## 2. 标识符与字符串

- 字段 / 表名用反引号：`` `work_item_id` ``、`` `project_key`.`story` ``。
- `<target:xxx>` 修饰符必须整体放在同一对反引号内（`` `name<target:all>` ``），且仅允许在关系判断 lambda 内部（`` x.`name<target:all>` ``）；顶层 SELECT / WHERE 直接引用主表字段禁止使用。
- 字符串值一律单引号（中文值也是）：`= '进行中'`、`LIKE '%性能%'`、`= '<id:759…>'`。反引号不能包值，`` = `进行中` `` 会被当成字段名。
- 值里带单引号写 `''`（`'张''三'`）。禁止 `\'`：服务端不做转义，`'张\'三'` 会当作字面量 `张\` 导致空结果。
- 日期必须加引号：`'2026-06-01'`，裸日期会被解析为减法。枚举值优先用 label（须先经 `lark-project__list_workitem_field_config` 确认存在），找不到时用 `<id:option_id>`。

## 3. 禁用语法

| 禁止 | 替代 | 原因 |
|------|------|------|
| `SELECT *` | 显式列出字段 | 不支持通配符 |
| `count(*)` / `SUM()` / `GROUP BY` | 从返回的 `count` 字段读总数 | 不支持聚合 |
| `REGEXP` / `regexp_like()` | `LIKE '%...%'` | 不支持正则 |
| `currentUser()` / `current_user()` | `current_login_user()` | 函数名错误 |
| `CONTAINS(field, val)` | `array_contains()` 或 `LIKE` | 无此运算符 |
| `NOT BETWEEN a AND b` | `< a OR > b` | 服务端行为不稳定 |
| SELECT 里放仅支持 WHERE 的函数（`current_login_user()`、`array_contains()`） | 按函数允许位置使用 | `status_time()`、`parent_work_item()` 的 SELECT 用法见对应专题 |

## 4. 不可查询的字段类型

出现在 SELECT / WHERE 会报 `unsupported field type`，必须移除并改用 `lark-project__get_workitem_brief`：`attachment` / `file`（附件）、`spec_doc` / `specDocs` / `spec_documents`（文档）。

例外：`multi-file`（如 `multi_attachment`）仅支持 `SELECT` / `IS NULL` / `IS NOT NULL`，返回 `key_label_value_list`；不支持 `LIKE` / `array_contains` 等深度筛选。

## 5. 字段名易错映射

MQL 支持字段 key 和中文名，必须优先 key，中文名多有同名歧义。

| ❌ 写法 | ✅ 替代 |
|--------|--------|
| `state_key` / `status` | `work_item_status` |
| `archiving_status` / `is_archived` | `archiving_date`（未归档用 `IS NULL`） |
| 中文名如「名称」「当前负责人」「创建时间」 | 先 `lark-project__list_workitem_field_config` 查 key（同时传 `project_key` 与 `work_item_type`） |

## 6. 枚举值 / 状态值禁止硬编码

状态、select、tree-select 等枚举 label 由「空间 + 工作项类型」自定义。禁止硬编码 `关闭`、`已完成`、`进行中`、`OPEN`、`CLOSED`，违反报 `attrValueLabel not found`。
流程：`lark-project__list_workitem_field_config` 取 options → 用真实 label 或 `<id:option_id>`。

## 7. LIKE 转义

- 通配符仅 `%`。`_` 不是通配符，未转义会被服务端拒回 `Internal % and _ characters must be escaped`（含 `%test_case%` 这类关键词中间的 `_`）。
- 字面量 `_` 写 `\_`，字面量 `%` 写 `\%`。模式必须是完整包含形态 `'%...%'`。

```sql
✅ LIKE '%性能问题%'   ✅ LIKE '%test\_case%'（字面量下划线转义）   ✅ LIKE '%100\%完成%'
❌ LIKE '100%完成'（缺前 %）   ❌ LIKE '%test_case%'（裸 _ 未转义）   ❌ LIKE '%100%完成%'（内部 % 未转义）
```

## 8. 多值右值

多值右值统一用元组 `(v1, v2)`，适用于 `IN` / `NOT IN` / `array_contains` / `=` / lambda 内的 `IN`。JSON 数组字符串 `'["a","b"]'` 在 `IN` 直接 syntax error，`=` 服务端兼容但不推荐。

唯一例外：控件函数场景要求 JSON 数组字符串——`array_intersect(<控件函数>, '["a","b"]')`（有交集）与 `risk_label() = '["a","b"]'`（集合完全相等）。

## 9. 数据类型

| MQL 类型 | 对应字段类型 |
|---------|-------------|
| bool | bool |
| bigint | number 中的 `work_item_id`、`auto_number` |
| double | 其它 number |
| varchar | text、multi-pure-text、multi-text、select、tree-select、radio、user、link、signal、workitem_related_select |
| date | date（`YYYY-MM-DD` 或 `YYYY-MM-DD+TZD`） |
| datetime | schedule、precise_date（`YYYY-MM-DDThh:mm:ss[TZD]`） |
| array(varchar) | multi-select、tree-multi-select、multi-user、link_cloud_doc、workitem_related_multi_select |
| array(struct) | compound_field |
| lambda | `x -> x IN ('a','b')` 等 |

## 10. 通过 MCP 传递 MQL

将查询原文直接放入工具 schema 指定的查询字符串参数，不经过 Shell。JSON 编码保留反引号、单引号与反斜杠；例如 MQL 中的字面量 `\_` 在 JSON 文本中应编码为 `\\_`，解析后的查询仍须包含一个反斜杠。不要双重序列化整条查询。

下例使用官方文档中的 `mql` 参数；若当前工具 schema 的查询参数名不同，使用其实际名称：

```json
{
  "name": "lark-project__search_by_mql",
  "arguments": {
    "project_key": "空间key",
    "mql": "SELECT `work_item_id`, `name` FROM `空间key`.`story` WHERE `name` LIKE '%性能%'"
  }
}
```
