# 错误处理规则

> 症状 → 修复动作映射。语法/协议细节引用 `mql-basics.md` / `mql-operators.md` / `mql-time-status.md` / `mql-people-roles.md` / `mql-nodes-relations.md` 与 SKILL.md「字段值格式」。

**通用原则**：先区分查询失败、明确未执行的写入和结果未知的写入；结果未知时回读核实，不盲目重发创建、评论、流转或发布。其余情况从报错提取关键字 → 匹配下表修复 → 重试。**同一错误最多自动重试 2 次（共 3 次尝试）**。仍失败则停止自愈，向用户结构化说明：① 原始请求与目标语义；② 每次修复的关键改动与服务端返回；③ 推测根因（字段/角色/枚举不存在、无权限等）并请求澄清。**禁止无限重试或反复微调同一参数**。

原生批量和分页工具合并 MCP 错误响应中的所有非追踪文本，保留经脱敏并限制长度的服务端说明、可用 `server_code` 和 `log_id`。追踪文本支持 `log_id:` / `logid:`，多次出现时使用最后一个。先根据具体说明修正；需要排障时附上追踪 ID。工具错误码与服务端错误码分开读取，不从已脱敏的签名 URL 或凭据恢复请求。错误解析同时保留外层错误码和嵌套诊断；401 / OAuth 失效即使出现在后续文本或嵌套 JSON 错误块中也会终止编排，应重新连接，不能当成单项失败继续尝试。

`structuredContent` 和文本混合返回时，以全部诊断识别认证状态。例如结构化部分为 `code=3001`、`OAuth token expired`，文本只有 `Request failed`，仍按认证失效停止；保留 `server_code=3001` 供排障，不能仅凭自定义错误码判断可继续。

`MCP_INVOCATION_EXPIRED`、`MCP_SESSION_REQUIRED`、`MCP_CATALOG_REQUIRED` 或 `MCP_TOOL_UNAVAILABLE` 表示当前调用、连接或工具能力不可继续使用，立即停止批量与分页编排。重新确认当前会话连接和工具发现后，再由有效的新调用开始；不自动切换请求者或复用旧连接。

分页部分成功时检查 `continuation.merge_mode`：`append` 追加尚未返回的页，`replace` 替换 `pages[page_index]`，其中索引从 0 开始。没有续查信息时不能猜测最后一页需要重试；详见 [performance.md](performance.md) 的续查与合并协议。

---

## 1. MQL 自愈规则（高频，优先匹配）

> `lark-project__list_workitem_field_config` / `lark-project__list_workitem_role_config` 必须同时带 `project_key` 和 `work_item_type`；`lark-project__list_workitem_types` 只需 `project_key`。

### 1.1 元数据类

| 报错症状 | 修复动作 |
|---------|---------|
| 字段 key 在该空间+工作项类型下不存在 | 立即调 `lark-project__list_workitem_field_config`，同时传空间、类型与报错中的字段名，替换重试 |
| 字段中文名歧义（多字段同名） | 改用字段 key。通过 `lark-project__list_workitem_field_config` 的 `field_query` 拿所有匹配 key，选语义正确的替换；无法判断询问用户 |
| 把角色当字段写（如 `经办人`） | 见 [mql-people-roles.md §3 角色列](mql-people-roles.md)：`lark-project__list_workitem_role_config` 取 `role_name` / `role_id`，用 `` `__<role_name>` `` 或 fallback 复合列名 |
| 枚举值/状态值在该空间+工作项类型下不存在 | `lark-project__list_workitem_field_config` 精确获取对应字段的 options，用真实 label 替换。禁硬编码 |
| 树状字段值写成完整路径或非叶子 | `lark-project__list_workitem_field_config` 获取 options，确认叶子 `option_id` / label；父级查询改用 `any_match` |
| 查询不支持的字段类型（`attachment` / `file` / `spec_doc` / `specDocs`） | 从 SELECT/WHERE 移除，改用 `lark-project__get_workitem_brief`。**`multi-file` 例外**：允许 `SELECT` / `IS NULL` / `IS NOT NULL`；深度筛选不支持 |

### 1.2 语法类

| 报错症状 | 修复动作 |
|---------|---------|
| 中文字符编码损坏 | 按 [mql-basics.md §10](mql-basics.md) 直接通过 MCP JSON 字符串保留 MQL 原文，检查 JSON 转义是否改变了引号、反引号或反斜杠 |
| 用了硬规则禁用语法（`SELECT *`、`count()`/`GROUP BY`、`REGEXP`、`CONTAINS()`） | 对照 [mql-basics.md §3](mql-basics.md)。`LIMIT n` 只截断（n ≤ 50），不要用 `LIMIT offset, n` 翻页，翻页走 `session_id` + `group_pagination_list` |
| 字段名未加反引号导致 `syntax error near ':...'` | 字段名用反引号；含 `<target:xxx>` 时**整体**放同一对反引号（`` `name<target:all>` ``） |
| 顶层 SELECT/WHERE 用了 `` `name<target:all>` `` 报 `attribute[...] not found` | `<target:xxx>` **仅**允许在关系判断 lambda 内（`` x.`name<target:all>` `` 形式）；顶层引用去掉修饰符 |
| 用 `\'` 转义单引号 | 改用 `''`（两个单引号） |
| `Internal % and _ characters must be escaped` | LIKE 内部字面量 `%` / `_` 必须写作 `\%` / `\_`；即便 `_` 出现在关键词中间（如 `%test_case%`）也会被服务端强制拒回，必须转义为 `%test\_case%`。见 [mql-basics.md §7](mql-basics.md) |
| LIKE 缺通配符 | 完整包含形态 `LIKE '%关键词%'` |

### 1.3 语义类

| 报错症状 | 修复动作 |
|---------|---------|
| FROM 缺空间或类型 | 修正为 `` FROM `project_key`.`work_item_type_key` `` |
| SELECT 中放了函数（`current_login_user()`、`array_contains()`） | 从 SELECT 移除，函数只能在 WHERE 中 |
| `parent_work_item() not supported in stage Where` | `parent_work_item()` 仅支持 SELECT；WHERE 中按父工作项过滤改用 `` any_relation_match(relation_field_chain('__父工作项'), x -> x.`work_item_id<target:all>` = '<父ID>') `` |
| 操作符与字段类型不兼容 | 对照 [mql-operators.md §1 兼容表](mql-operators.md) 修正。常见：`number` / `bigint` 不支持 `BETWEEN` / `LIKE` / `array_contains`，改为 `>=` + `<=` / 精确等值 |
| 多值右值用了 JSON 数组字符串（`IN '["a","b"]'`） | `IN` 直接 syntax error，改元组 `IN ('a','b')`。`=` 服务端当前兼容 JSON 数组字符串但非推荐写法，统一改元组 `= ('a','b')`。**例外**：`array_intersect` / `risk_label() = ...` 保留 JSON 数组字符串 |
| `tree-multi-select` / `workitem_related_multi_select` 右值拒回 `metadata error` 或 `attrValueLabel not found`（如裸 option_id / 裸 work_item_id） | 改为 label 或 `<id:option_id>` / `<id:work_item_id>` 包裹形式。见 [mql-operators.md §1](mql-operators.md) |
| signal 字段 `IS NULL` / `IS NOT NULL` 报 `operator not supported` | signal 不支持空判断，改用 `!= '真实 label'` 或去掉该条件 |
| signal 值位传了 `option_id` / `<id:>` / `'true'` / `'false'` / `'null'` | 改用 `option_name` label（如 `'已通过'`） |
| Lambda 报 `lambda predicate operator not supported: <OP>` / `unsupported lambda predicate` | Lambda 内仅支持 `x = 'v'`、`x IN (...)`、同变量 OR。其余（`!=` / `NOT IN` / 比较符 / `LIKE` / `BETWEEN` / `IS NULL` / `RELATIVE_DATETIME_*` / `AND` 复合 / 嵌套 Match）全部拒回。见 [mql-operators.md §5](mql-operators.md)。多选/数组字段优先用顶层 `IN` / `NOT IN` / `array_contains` / `none_match`；仅值列表含 `team()` / `current_login_user()` 时用 `any_match` |
| `get_node_attribute('__BELONGING','状态')` 触发 nil pointer / panic | 见 [mql-nodes-relations.md §4](mql-nodes-relations.md) 权威规则：状态类改用 `=` 顶层比较（禁被 `array_contains` 包裹）；`__BELONGING` 属性禁 AND 组合 |

### 1.4 参数类

| 报错症状 | 修复动作 |
|---------|---------|
| `RELATIVE_DATETIME_*` 报 `unexpected operator for future` / `invalid argument` | 见 [mql-time-status.md §1.1 兼容矩阵](mql-time-status.md)：`_EQ` 只接受 `today`/`tomorrow`/`yesterday` 且**无 offset**；`_GT/_GE/_LT/_LE` 只接受 `today`（可带 `±Nd`）；`future`/`past`+`Nd` 只允许配 `_BETWEEN` |
| ORDER BY 字段不支持排序 | 换可排序字段（如 `updated_at` / `start_time` / `work_item_id`）或移除 |
| MQL 与 session_id 都空 | 首查必须传 MQL；翻页必须传首查返回的 session_id |
| 翻页参数缺失 / 翻页仍回第 1 页 | 传 `group_pagination_list '[{"group_id":"1","page_num":N}]'`（无分组时 `group_id` 固定 `"1"`，N 从 2 起）；翻页时不要再传 `mql`，同传会按新查询重跑 |
| 未传 project_key | `lark-project__search_by_mql` 的 `project_key` 必填 |
| 空间不存在 | 用 `lark-project__search_project_info` 确认 |
| 空间名匹配多个 | 从报错提取候选，让用户选择或用精确 project_key 重试 |
| 当前用户对该空间无权限 | 告知用户需申请访问，**禁止重试** |

---

## 2. 通用字段值自愈

| 报错症状 | 修复动作 |
|---------|---------|
| `need STRING type, but got: LIST/MAP` | 原生 JSON 改为 JSON.stringify 字符串（见 SKILL.md「字段值格式」） |
| 字段值类型错配（数字↔字符串、单值↔数组） | 仅改格式，值不变 |
| 级联选项传非叶子节点 | 展示 `children` 树，让用户选叶子 |
| 枚举值不在可选项 | 从 options 匹配；唯一命中则修正重试，否则询问用户 |

---

## 3. 非 MQL 错误速查

| 报错症状 | 修复动作 |
|---------|---------|
| 找不到空间 / 中文名多命中 | `lark-project__search_project_info` 验证，取 project_key 精确调用 |
| 找不到工作项类型 | `lark-project__list_workitem_types` 确认合法 `type_key` |
| 模板不存在/禁用 | `lark-project__list_workitem_field_config` 获取可用模板 |
| 角色查询无结果 / 经办人报告人查不到 | `lark-project__list_workitem_role_config` 确认 `role_name` / `role_id`；系统默认 `role_name`=`经办人`/`报告人`，`role_id`=`operator`/`reporter` |
| 人名→userkey 转换失败 | `lark-project__search_user_info` 批量查询 |
| 人员字段写入失败 | user 传单个 userkey；multi-user 必须 stringified 数组（如 `"[\"k1\",\"k2\"]"`） |
| 找不到节点 | `lark-project__get_node_detail` 查全量节点详情列表匹配真实 `node_id`（`lark-project__get_workitem_brief` 只返进行中节点） |
| 节点流转失败 | 节点流用 `lark-project__transition_node`；状态流用 `lark-project__transition_state`（先 `lark-project__get_transitable_states` 取 `transition_id`，`lark-project__get_transition_required` 查必填） |
| 重复流转已完成节点 | 流转前 `lark-project__get_node_detail` 检查状态 |
| 节点未激活 | 先确认工作流进度 |
| 创建缺模板 | `lark-project__list_workitem_field_config` 获取模板字段 |
| 创建必填字段未提供 | `lark-project__get_workitem_field_meta` 取 `is_required=1` 的所有字段（注意 `lark-project__list_workitem_field_config` 不返回 required 标记） |
| 角色更新失败 | 改用 `lark-project__update_field` 的 `role_operate`（不走 fields） |
| `group_type=bind` 缺 `group_id` | 补非空 `group_id`；解绑用 `{"type":"disabled"}` |
| `group_type=auto/disabled` 却传了 `group_id` | 二选一：保留 `bind + group_id`，或去掉 `group_id` |
| `page_size` 类型错误 | 按 schema 直接传 JSON 数字；`page_token` 保持字符串 |
| `lark-project__list_todo` 需选择工作区 | 从报错列表把 `asset_key`（Asset_xxx）传入重试 |
| 操作记录时间区间非法 | `start_time < end_time`，格式毫秒时间戳或 `YYYY-MM-DD` |
| 关联查询缺 `relation_id` | 先用 `lark-project__list_workitem_relations` 获取 |
| 接口限流 | 等待 1-2 秒重试，或减少并发 |
| 视图配置失效 / session 缓存过期 | 前者 `lark-project__search_view_by_title` 取有效 ID；后者不传 `session_id` 重查 |
| 工作项已冻结/终止/归档 | 告知用户不可编辑，**禁止重试** |
| 状态流转目标不可达 | 先 `lark-project__get_transitable_states` 获取合法路径供用户选择 |
| 选项可见性不满足 | 重新用 `lark-project__list_workitem_field_config` 取上下文可见选项 |
| `work_item_type_key` 不存在 | `lark-project__list_workitem_types` 取合法列表 |
| WBS 草稿不存在 | 先用 `lark-project__create_wbs_draft`，或确认该空间已启用 WBS |
| 非 IPD 项目调用 WBS/资源库/交付物 | 告知用户该空间不支持 |
| `lark-project__edit_wbs_draft` 父行不支持新增子行 | `lark-project__list_wbs_draft_rows` 确认父行类型和拆解模式 |
| 工时未启用 | 需在项目设置开启（`actual_work_time_switch=true` 或安装"工时登记"插件），**禁止重试** |
| 工时记录返回空但确认有数据 | 确认 `work_item_type` 是否正确 |

---

## 4. 熔断条件（立即终止）

- 空间未找到（`lark-project__search_project_info` 连续 3 次失败）
- Permission Denied（无空间访问权限）
- 服务端返回明确的"已归档/已冻结/无权限"业务错误
