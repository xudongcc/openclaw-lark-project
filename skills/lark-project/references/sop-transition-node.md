# 流转节点

> 开始前读取 [SKILL.md](../SKILL.md)，按其中的连接、工具发现、字段协议与错误处理规则执行。

本技能用于在飞书项目中流转节点流工作项的节点（confirm/rollback），在用户已授权的范围内执行。

> **注意**：此技能仅用于**节点流**工作项（根据实际工作流确认），不适用于状态流工作项。状态流转参见主文档 [SKILL.md](../SKILL.md) 的 `lark-project__transition_state`。

---

## 核心设计原则：最小查询 + 按需补充

`lark-project__transition_node` 工具**只接受 node_key（节点 ID），不支持传节点名称**。因此必须先通过 `lark-project__get_node_detail` 获取名称→node_key 映射。但查询应保持精准轻量：

- **用户指定了节点名** → `node_id_list` 直接传中文名称 `["节点名"]`，精准查单个节点
- **用户说"所有节点"** → 传 `["_all"]` 查全量，但**不传 `field_key_list`**（不查表单字段）
- **直接尝试流转**：拿到 node_key 后立即调 `lark-project__transition_node`
- **按需补充字段**：仅当流转失败（提示必填字段未填）时，才查询必填字段并补充

> **为什么不预查全量字段？** `lark-project__get_node_detail` 有分页限制（每页 20 个节点），查全量字段极慢。大多数场景无需补充字段，只在流转失败时按需查目标节点的必填字段即可。

---

## 执行流程

### STEP 1 — 定位工作项

从用户输入中提取 work_item_id 和 project_key：
- 用户给了 **URL** → 先调用 `lark-project__url_decode`，再按 [url-kinds.md](url-kinds.md) 识别并验证具体工作项；视图、主页或未知路由不能直接作为单个工作项目标
- 用户给了 **ID** → 需同时确定 project_key
- 信息不足时才追问

> **URL 处理**：URL 中候选的 `simple_name` 必须再调 `lark-project__search_project_info` 转为权威 `project_key`（同名空间可能有多个无权限）。路径只提供候选信息，必须用查询验证空间与实例。`work_item_id` 参数必须是字符串类型。

### STEP 2 — 精准查节点

根据用户意图选择最高效的查询方式：

| 用户意图 | `node_id_list` 传参 | `field_key_list` | 说明 |
|---|---|---|---|
| 指定了节点名（如"完成开发中"） | `["开发中"]`（直接传中文名） | 不传 | 精准查单个节点 |
| 指定了多个节点名 | `["开发中", "测试中"]` | 不传 | 精准查指定节点 |
| "当前节点" / 未指定节点 | `["_all"]` | 不传 | 查全量找 status="doing" |
| "所有节点" / "全部流转" | `["_all"]` | 不传 | 查全量但不带字段 |

从返回结果中获取 **name**、**node_key**、**status**（finished/doing/not_started）。

**自动确定操作类型：**
- "完成"、"流转"、"确认"、"推进" → action = `confirm`
- "回滚"、"退回"、"撤回" → action = `rollback`
- 未明确说 → 默认 `confirm`

**目标节点确定：**
- 用户指定了节点名 → 从返回结果中取 node_key
- 用户说"当前节点" → 选 status = "doing" 的节点
- 用户说"所有节点" → 按顺序逐个处理未完成节点
- 用户没指定 → 仅有一个进行中节点时使用；多个候选时合并询问用户
- 名称匹配不到 → 用 `["_all"]` 重新查全量，列出所有节点供用户选择

**回滚操作**：从用户输入提取原因；用户没给则用"用户发起回滚"作默认原因。

### STEP 3 — 直接尝试流转

```json
{
  "name": "lark-project__transition_node",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "node_id": "节点node_key",
    "action": "confirm"
  }
}
```

**三种结果分支：**

| 结果 | 处理 |
|---|---|
| 流转成功 | 用 `lark-project__get_node_detail` 回读确认节点状态，再进入 STEP 6 |
| 必填字段未填写 | 进入 STEP 4 补充字段 |
| 其他错误（权限/节点不存在等） | 进入错误恢复逻辑 |

### STEP 4 — 按需补充必填字段（仅流转失败时）

只有当 STEP 3 流转失败、提示必填字段未填时才进入本步骤。

**4.1 查询未完成的必填字段**

```json
{
  "name": "lark-project__get_transition_required",
  "arguments": {
    "work_item_id": "工作项ID",
    "state_key": "目标节点node_key",
    "project_key": "空间key"
  }
}
```

传入 `mode = "unfinished"` 仅查未完成必填项。从返回中识别每个字段的 `form_item_type`（node_field / field）和 `field_type`。

**4.2 评审结论 / 评审意见（`node_finished_conclusion` / `node_finished_opinion`）**

这是节点的「整体完成结论 / 意见」，可经接口读写，但**前提是该节点已启用这两个字段**——只有节点开了「完成结论」配置，`lark-project__get_node_detail` 的 `form_items` 里才会出现它们；没启用时写入会报 `node field is invalid`。所以**先读 `form_items` 确认字段存在，再写**。

**读取**：用 `lark-project__get_node_detail` 按 `field_key_list` 读，或用 `lark-project__get_workitem_brief` 按 `fields` 读。字段未启用时返回里不会出现对应项：

```json
{
  "name": "lark-project__get_node_detail",
  "arguments": {
    "work_item_id": "工作项ID",
    "field_key_list": [
      "node_finished_conclusion",
      "node_finished_opinion"
    ],
    "project_key": "空间key",
    "node_id_list": [
      "节点node_key"
    ]
  }
}
```

**查询结论选项**：结论是 select 型，用 `lark-project__list_node_field_config` 查 options，写入用其 `option_id`：

```json
{
  "name": "lark-project__list_node_field_config",
  "arguments": {
    "field_keys": [
      "node_finished_conclusion"
    ],
    "project_key": "空间key",
    "work_item_type": "类型key"
  }
}
```

**写入**：经 `lark-project__update_node` 的 `fields` 写入——结论写合法 `option_id`，意见写文本。

> 🚨 **必须分两次调用，一次只写一个字段。** `lark-project__update_node` 的 `fields` 数组里如果同时放结论和意见，**只有第一个字段会落库，其余被静默丢弃**（返回仍是 `success`）。这和「排期 / 负责人不要同时改」是同一类约束。每次写完都要 `lark-project__get_node_detail` 回读校验，不要凭返回的 success 断言已写入。

```json
{
  "name": "lark-project__update_node",
  "arguments": {
    "work_item_id": "工作项ID",
    "fields": [
      {
        "field_key": "node_finished_conclusion",
        "field_value": "option_id"
      }
    ],
    "project_key": "空间key",
    "node_id": "节点node_key"
  }
}
```

```json
{
  "name": "lark-project__update_node",
  "arguments": {
    "work_item_id": "工作项ID",
    "fields": [
      {
        "field_key": "node_finished_opinion",
        "field_value": "评审意见文本"
      }
    ],
    "project_key": "空间key",
    "node_id": "节点node_key"
  }
}
```

**4.3 硬拦截：不可写入的字段类型**

以下字段类型 **API 无法写入**。如果被设为流转必填项，**立即中断当前节点的流转**并告知用户：

| 字段类型 | 说明 | 拦截原因 |
|---|---|---|
| `actual_work_time` | 实际工时 | 需在页面手动登记 |
| `owners_finished_info` | 负责人完成结论与意见 | 仅各负责人可在页面操作 |
| `vote-boolean` / `vote-option` / `vote-option-multi` | 投票类 | 仅支持页面交互 |
| 计算字段 | 系统自动计算 | 只读 |

🚨 遇到硬拦截时输出：
> "节点流转失败。当前节点【节点名称】设置了必须填写【字段名称】（类型：xxx）才能流转。由于该字段类型不支持自动化补充，请您在飞书项目页面手动填写后，再通知我继续流转。"

**4.4 可补充字段的值转换**

**人员字段处理规则（极重要）：**
- 用户明确指定了人员 → `lark-project__search_user_info` 转 userkey
- 搜索到多个同名用户 → 若用户说“分配给我自己”，按 [auth-guard.md](auth-guard.md) 解析真实 userkey，否则**必须向用户确认**
- 用户未指定但为必填 → **向用户询问**，不要自动默认为当前用户
- 唯一例外：用户明确说“我来负责”/“分配给我”时，才按 [auth-guard.md](auth-guard.md) 使用已确认的当前用户 userkey

**节点专属字段**（使用 `lark-project__update_node` 的专用参数）：

| field_key | 更新方式 |
|---|---|
| `owner` (multi-user) | `node_owners` 参数。用户指定人 → search 转 userkey；用户说“我来” → 按身份流程取得真实 userkey；**未指定 → 询问** |
| `schedule` | `node_schedule` 参数，格式 `{"estimate_start_date": ms, "estimate_end_date": ms, "owners": [userkey], "points": 数字}` |
| `point` (number) | `node_schedule` 中的 `points` 字段 |

> 清空节点负责人时传空数组 `[]`（不是 `["_all"]`，`["_all"]` 仅用于 `lark-project__update_field` 中删除角色配置）。

> 评审结论 / 意见（`node_finished_conclusion` / `node_finished_opinion`）的读写口径见 §4.2：需节点已启用该字段，且**结论与意见必须分两次 `lark-project__update_node` 调用**（一次只落第一个字段）。

**通用字段类型转换**（完整格式见主文档 [SKILL.md](../SKILL.md)「字段值格式」）：

> 🚨 **关键约定**：表单字段 `field_value` 协议层是 **STRING**。标量直接传字符串；数组/对象**必须 JSON.stringify**，否则报 `need STRING type, but got: LIST`。（上方「节点专属字段」走 `lark-project__update_node` 的专用参数，不受此约定影响。）

| field_type | 节点流转场景差异化提示 |
|---|---|
| `schedule`（表单字段） | **stringified** `"[开始ms,结束ms]"`；**节点专属排期不走本表**，用 `lark-project__update_node` 的 `node_schedule` 参数 |
| `signal` | `option_id` 字符串（以 `lark-project__list_workitem_field_config` 的 `options[].option_id` 为准；不接受 `"true"`/`"false"`/`"null"`） |
| `workitem_related_multi_select` | **stringified** ID 数组，**禁止写入自身 ID**（防循环引用，触发 `exists loop` 报错） |
| `tree-select` | 只传 `"option_id"` 纯字符串，不传 value/label/children 复杂 JSON |
| `multi-file` | 按 [attachment.md](attachment.md) 执行完整协议：实时消歧目标字段、完成对象存储上传、写入字段并回读同一字段验收；多个附件逐个追加 |
| `file` | 按 [attachment.md](attachment.md) 的兼容性规则处理，不得假设它与 `multi-file` 具有相同的多附件能力 |

> 其余通用字段类型（text / number / bool / user / multi-user / date / precise_date / select 系列 / multi-text / telephone / email / workitem_related_select 等）写入格式详见主文档 [SKILL.md](../SKILL.md)「字段值格式」章节。

> **用户提供的是工作项名称而非 ID** 时，按 [field-value-extras.md](field-value-extras.md)「关联工作项名称 → ID 转换」完整流程（获取目标约束 → `lark-project__search_by_mql` 搜索 → 消歧 → 按类型写入）处理。

**节点字段 vs 工作项字段**：
- `form_item_type = "node_field"` → `lark-project__update_node`，传 `node_id` + `fields`
- `form_item_type = "field"` → `lark-project__update_field`（工作项级别）
- 节点枚举值用 `lark-project__list_node_field_config` 查询；工作项枚举值用 `lark-project__list_workitem_field_config` 查询（用 `field_keys` 精确或 `field_query` 模糊搜索，禁止逐页遍历）

**4.5 字段补充执行策略**

独立的读取可并行；同一工作项、同一节点的写入串行执行并逐次回读，避免覆盖或静默丢字段。

1. **分类**：节点负责人（owner）→ `node_owners`；排期/估分 → `node_schedule`；其他字段 → `fields` 或 `lark-project__update_field`
2. **节点负责人和排期/估分不可同时更新**，需分两次调用 `lark-project__update_node`
3. 其他节点字段通过 `lark-project__update_node` 的 `fields` 参数逐个更新并回读，尤其结论与意见不能放同一次调用
4. 工作项字段通过 `lark-project__update_field` 的 `fields` 参数批量更新

**4.6 用户未提供值时**：
- 人员类 → **必须询问**
- 排期/日期类 → **询问用户**
- 枚举类 → 列出选项让用户选
- 文本/数字/布尔 → 只使用用户提供或已确认的默认规则；缺失值合并询问，不编造估分、结论或业务说明
- 待确认字段 > 3 个时，一次性列出让用户批量回复

### STEP 5 — 补充后再次流转

字段补充完成后，**再次调用 `lark-project__transition_node`** 执行流转。仍然失败则读取错误信息重新处理（最多重试 2 次）。

### STEP 6 — 返回结果

展示表格汇总：

| 节点名称 | 操作 | 结果 | 备注 |
|---|---|---|---|
| 需求评审 | confirm | ✅ 成功 | — |
| 开发中 | confirm | ✅ 成功 | 自动补充了排期、估分、负责人 |
| 测试中 | confirm | ❌ 阻塞 | 必填字段「实际工时」不支持 API 更新 |

如果有阻塞节点，明确列出需要用户手动操作的字段和原因。

---

## 批量流转

当用户说"所有节点"/"全部流转"时：
1. 按节点顺序依次流转：直接调 `lark-project__transition_node` → 失败则按需补充 → 下一个
2. 每个节点独立处理，某个节点被阻塞不影响已完成的节点
3. 最终汇总所有节点的流转结果

---

## 错误自动恢复（自愈机制）

> 通用自愈规则（格式错误、级联层级、枚举不合法）见 [error-handling.md](error-handling.md)。以下为本 SOP 补充规则：

| 报错特征 | 自愈动作 |
|---------|---------|
| 节点名匹配不到 | 用 `["_all"]` 查全量节点，模糊匹配；仍失败则列出所有节点供用户选择 |
| 必填字段缺失 | 进入 STEP 4 按需补充 |

---

## 熔断机制 (Circuit Breaker)

> 通用熔断规则（空间未找到、权限不足）见主文档 [SKILL.md](../SKILL.md)「错误处理」。以下为本 SOP 补充规则：

1. **必填字段全部为硬拦截类型**：当前节点所有未完成必填字段都属于不可写类型
2. **连续流转失败**：同一节点重试 2 次仍然失败

---

## 常见问题

| 问题 | 处理 |
|------|------|
| 用户未指定工作项 | 追问工作项 ID 或 URL |
| 用户未指定节点 | 唯一进行中节点可直接用；存在多个时请用户选择 |
| 用户操作的是状态流工作项 | 提示改用 `lark-project__transition_state`，本技能仅处理节点流 |
| 流转报"必填字段未填" | 进入 STEP 4 按需补充 |
| 补充字段后仍失败 | 检查是否存在硬拦截字段，明确告知用户 |
