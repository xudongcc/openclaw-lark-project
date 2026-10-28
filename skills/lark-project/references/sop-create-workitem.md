# 创建工作项

> 开始前读取 [SKILL.md](../SKILL.md)，按其中的连接、工具发现、字段协议与错误处理规则执行。

本技能用于在飞书项目中创建工作项（需求、任务、缺陷等），在用户已授权的范围内执行。

---

## 执行流程

### STEP 1 — 提取意图

从用户输入中提取：
- **空间名**：哪个项目空间
- **工作项类型**：需求 / 任务 / 缺陷 / 其他
- **字段值**：标题、优先级、负责人、描述等
- **URL**（如有）：先调用 `lark-project__url_decode`，按 [url-kinds.md](url-kinds.md) 识别空间和类型的候选信息，用空间、类型查询验证。创建入口没有现有工作项 ID；未知路由不要猜。

### STEP 2 — 确认空间和类型

1. 用 `lark-project__search_project_info` 验证空间 → 获取 `project_key`
2. 用 `lark-project__list_workitem_types` 获取类型列表 → 确认 `work_item_type`

> 唯一匹配则直接用，多个匹配则展示列表让用户选，无匹配则问用户。**禁止猜测。**

### STEP 3 — 收集元数据（并行）

同时发起以下调用：

| 调用 | 目的 |
|------|------|
| `lark-project__get_workitem_field_meta` | 获取该类型的**必填字段**元信息（前置校验，防止因空间自定义必填项缺失导致创建失败） |
| `lark-project__list_workitem_field_config(field_keys=["template"])` | **获取模板 ID**（创建必填） |
| `lark-project__list_workitem_field_config(field_query="用户提到的字段名")` | 确认字段 key、类型、枚举值（通过 `field_keys` 精确匹配或 `field_query` 模糊搜索，避免全量拉取时因分页导致自定义字段遗漏） |
| `lark-project__list_workitem_role_config(page_num=1)` | 获取角色定义（如用户指定了负责人等角色） |

如用户提到了人名，并行调用 `lark-project__search_user_info` 转换为 userkey。

> 默认只查询在职用户。只有当用户明确要求包含离职、停用等非在职人员，或在职结果为空且用户要求继续查找时，才给 `lark-project__search_user_info` 传 `need_all_status=true`。

**附件字段门禁（仅 `resource_type=15`）**：用户要求写入工作项附件字段时，必须额外调用 `lark-project__list_workitem_field_config`，实时查询当前空间和类型下全部 `file` 和 `multi-file` 字段。用户指定字段名或 key 时做精确匹配；用户只说“附件”且出现多个候选时，列出字段名、key、类型并让用户选择。禁止默认取第一个，禁止复用历史会话里的附件字段，禁止把 `attachment` 或 `multi_attachment` 写死。确定目标后，上传、创建和回读都必须使用同一个字段 key。完整协议见 [attachment.md](attachment.md)。 评论附件/图片（13/14）跳过此门禁，不传 `field_key`，发布后回读评论；富文本图片（16）查询用户指定的富文本字段，不按 file/multi-file 过滤，保留原内容并回读同一字段。

### STEP 4 — 自动匹配模板

根据 STEP 3 获取的模板枚举值：
- **只有一个模板** → 自动选择
- **多个模板** → 根据用户描述中的关键词匹配最接近的模板名，选不出来时展示列表让用户选
- **用户明确指定了模板名** → 精确匹配

### STEP 5 — 自动补全必填项与转换字段值

**1. 核对必填项**

对比 `lark-project__get_workitem_field_meta` 返回的必填字段与用户已提供的值。可从本轮已确认的业务上下文补全；缺失的人员、模板、枚举、日期、估分等业务值合并询问。不能默认取第一个选项，或填写“自动生成”、true 等没有事实依据的值。用户已明确授权的默认规则可以复用。

**2. 转换字段值**

将用户提供或按已确认规则补全的业务值转换成 API 需要的格式：

| 来源 | 转换 |
|------|------|
| 人名 | 调用 `lark-project__search_user_info` 批量转换为 userkey |
| 枚举值 | 从字段配置的 options 中按 option_name 匹配得到 option_id |
| 日期 | 转为毫秒时间戳 |
| 其他类型 | 按主文档 [SKILL.md](../SKILL.md)「字段值格式」规范转换 |

**格式速查**（创建场景特有约束；通用类型见主文档 [SKILL.md](../SKILL.md)「字段值格式」章节）：

> 🚨 **关键约定**：`field_value` 协议层是 **STRING**。标量直接字符串化；数组/对象**必须先 JSON.stringify**，否则会报 `need STRING type, but got: LIST`。

| 字段类型 | 差异化提示 |
|---------|-----------|
| `role_owners` | **仅创建时可用**；stringified 对象数组 `"[{\"role\":\"<role_id>\",\"owners\":[\"<userkey>\"]}]"` |
| `signal` | option_id 纯字符串 `"<option_id>"`（以 `lark-project__list_workitem_field_config` 的 `options[].option_id` 为准；不接受 `"true"`/`"false"`/`"null"`） |
| `workitem_related_multi_select` | **stringified** ID 数组，**禁止写入自身 ID**（防循环引用，触发 `exists loop`） |
| `multi-file` | 按 [attachment.md](attachment.md) 完成“本地文件校验 → 字段消歧 → 对象存储上传 → 字段绑定 → 写后验收”。单附件可随创建写入；多个附件先随创建写入第一个，获得工作项 ID 后再逐个读取、合并并更新，避免 `unique` 校验与覆盖丢失 |
| `file` | 按 [attachment.md](attachment.md) 的兼容性规则处理；不得假设旧版或单附件字段支持多附件，也不得与 `multi-file` 共用未经验证的多附件写入协议 |

> 其余通用字段类型（text / user / multi-user / date / schedule / precise_date / select 系列等）写入格式详见主文档 [SKILL.md](../SKILL.md)「字段值格式」章节。

**角色设置**（创建时）：通过 fields 中的 `role_owners` 字段，值为 stringified 对象数组：

```json
{"field_key":"role_owners","field_value":"[{\"role\":\"<role_id>\",\"owners\":[\"<userkey>\"]}]"}
```

> **角色补充**：创建时除了能在 `fields` 数组内处理极少部分内置的 role_owners 字段外，针对其他自定义角色（如 PO、PM、Tech Lead 等），须在创建后用 `lark-project__update_field` 的 `role_operate` 参数追加写入。

### STEP 6 — 创建

```json
{
  "name": "lark-project__create_workitem",
  "arguments": {
    "work_item_type": "类型key",
    "fields": [
      {
        "field_key": "template",
        "field_value": "模板ID"
      },
      {
        "field_key": "name",
        "field_value": "标题"
      }
    ],
    "project_key": "空间key"
  }
}
```

🚨 **批量创建**：当用户要求批量创建多个工作项时，必须**串行调用**（逐个请求），禁止高并发，以免触发平台限流。每个 field_value 均须符合「字段值格式」的 STRING 约定（标量直接字符串化；数组/对象 JSON.stringify）。

### STEP 7 — 确认结果

创建成功后先调 `lark-project__get_workitem_brief` 核对实例与关键字段；如涉及附件字段（15），必须显式查询 回读已消歧的目标字段，逐一核对请求文件名和数量。上传接口返回 token、创建接口返回成功，均不能替代目标字段的写后验收；回读了其他附件字段也不算成功。

验收通过后，向用户展示：
- 工作项 ID 和名称
- 链接（如返回中包含）
- 已设置的关键字段摘要
- 附件目标字段名/key、实际文件名和数量；无法验证页面布局时仅声明 API 字段写入成功

---

## 特殊字段写入规则

### 级联选项 (Tree-select)

1. **格式极简**：对于业务线（`_business`）等级联单选字段，`field_value` **只传 `option_id` 纯字符串**，不要传 `value/label/children` 的复杂 JSON。
2. **层级强校验**：如果报错 `级联选项字段值不满足层级配置`，说明该字段要求选到末级叶子节点。此时查询该选项的 `children` 树，**将末级叶子节点列表展示给用户选择**，禁止自行向下盲猜。

### 不可写入的字段类型

以下字段类型不支持通过 API 写入，遇到时**直接跳过并告知用户原因**：

| 类型 | 原因 |
|------|------|
| `vote-boolean`（轻量表态） | 计数器，只能由用户在界面操作 |
| `vote-option` / `vote-option-multi`（投票） | 不支持通过接口伪造投票结果 |
| 计算字段 | 系统自动计算，只读 |

### 富文本与关联字段

- **富文本/多行文本**：直接传 Markdown 字符串（`# 标题`、`|列1|列2|`、代码块等）。
- **关联云文档（PRD）**：传 URL 数组，如 `["https://xxx.feishu.cn/docx/xxx"]`。
- **前置依赖/关联工作项**：传目标工作项 ID。**注意**：不同空间可能要求字符串 `"<work_item_id>"` 或数字格式，遇到类型校验失败立刻切换格式重试。用户提供的是工作项**名称而非 ID** 时，按 [field-value-extras.md](field-value-extras.md)「关联工作项名称 → ID 转换」完整流程处理。
- **系统外信号类型 (`signal`)**：传 `option_id` 纯字符串（如 `"<option_id>"`；以 `lark-project__list_workitem_field_config` 的 `options[].option_id` 为准）。**不接受 `"true"` / `"false"` / `"null"`**。当前系统外信号常见 4 个 option：`passed` / `notpassed` / `processing` / `noinformationyet`。

---

## 错误自动恢复（自愈机制）

> 通用自愈规则（格式错误、级联层级、枚举不合法）见 [error-handling.md](error-handling.md)。以下为本 SOP 补充规则：

| 报错特征 | 自愈动作 |
|---------|---------|
| 序列化错误 / 网络超时 | 格式错误按 schema 修正；超时先查询是否已创建，结果未知时不重复提交 |
| 字段 key 不匹配 | 用 `field_query` 查询候选；唯一且语义匹配时使用，否则请用户消歧 |
| 人名解析失败 | 尝试用邮箱前缀再搜一次 |
| 明确缺少必填字段 | 核对字段类型限制，关联工作项尝试数字↔字符串切换 |

---

## 熔断机制 (Circuit Breaker)

> 通用熔断规则（空间未找到、权限不足）见主文档 [SKILL.md](../SKILL.md)「错误处理」。以下为本 SOP 补充规则：

1. **工作项类型未找到**：`lark-project__list_workitem_types` 失败超过 3 次
2. **字段转换大面积失败**：字段值转换失败比例 > 60%，终止流程并列出失败字段明细，**不要强行创建残缺数据**

---

## 常见问题

| 问题 | 处理 |
|------|------|
| 用户未指定空间 | 问用户 |
| 用户未指定类型 | 如空间只有一种类型则直接用，否则问用户 |
| 用户提到的字段不存在 | `lark-project__list_workitem_field_config(field_query="关键词")` 模糊查询，找不到则告知用户 |
| 模板有多个 | 根据关键词匹配，匹配不到则展示列表让用户选 |
| 枚举值匹配不到 | 展示该字段所有枚举值让用户选 |
| 人名匹配到多人 | 展示完整列表让用户指定，**禁止自行选择** |
