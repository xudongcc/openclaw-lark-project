# 附件域

## 核心边界

附件有三个独立阶段：**上传文件到对象存储 → 绑定用户指定的评论或字段 → 回读同一目标验收**。上传成功不等于绑定成功；只有三步都完成，才可以向用户宣称附件已写入目标。先确定 `resource_type`，不同场景不能共用附件字段门禁。

| 用户目标 | `resource_type` | 上传前确认 | 绑定与验收 |
|---|---|---|---|
| 评论附件 | 13 | 已有工作项 ID；不查询附件字段，不传 `field_key` | `add_comment` 绑定，`list_workitem_comments` 回读该评论 |
| 评论图片 | 14 | 已有工作项 ID；不查询附件字段，不传 `field_key` | `add_comment` 插入图片，`list_workitem_comments` 回读该评论 |
| 工作项附件字段 | 15 | 当前类型的 `file/multi-file` 字段，消歧后传 `field_key` | 创建或更新该字段，`get_workitem_brief` 回读同一字段 |
| 富文本字段图片 | 16 | 用户指定的富文本字段，经实时元数据验证后传 `field_key` | 创建或更新该富文本字段，`get_workitem_brief` 回读同一字段 |

表中工具短名实际调用时均加 `lark-project__`。用户未说明要放入评论、附件字段还是富文本且上下文无法确定时，先合并询问目标，不默认套用 `resource_type=15`。评论场景须先有工作项 ID；创建新工作项时要添加评论，先完成创建再申请评论上传计划。

附件上传/下载底层分两步：先调 `lark-project__upload_file` / `lark-project__get_download_url` 申请带签名的对象存储 URL，再与对象存储做一次或多次 HTTP 直连。

`lark-project__upload_file` 的返回结果可能包含 `target_unit_code`；自行对对象存储发起上传时，若该值非空，必须在每次 POST（包括所有上传分片）添加 `x-target-unit`，值原样使用该 `target_unit_code`；缺失或为空时不添加该请求头。`lark-project__get_download_url` 的返回结果同样可能包含 `target_unit_code`；自行下载时，若该值非空，必须在每次 GET（包括所有下载分片）添加同样的 `x-target-unit`，值原样使用该 `target_unit_code`；缺失或为空时不添加该请求头。

插件通过 `lark-project__attachment_upload` / `lark-project__attachment_download` 执行实际文件传输。MCP `lark-project__upload_file` / `lark-project__get_download_url` 使用现有 OAuth 身份检查权限并申请计划；原生传输仅携带文件签名与 `x-target-unit`，不转发 OAuth token。

文件路径位于 OpenClaw Gateway 机器，相对路径优先基于宿主 `fsPolicy.root`，未指定时基于会话 workspace；开启 `workspaceOnly` 时限制在此根目录，宿主额外授权的 `readOnlyRoots` 仅可供上传读取，不能作为下载保存目录；沙箱会话不提供附件工具。上传通过 OpenClaw 安全文件接口验证实际打开的文件，拒绝硬链接；下载通过宿主 `copyIn` 接口直接发布完整文件，由宿主执行覆盖策略、取消检查和写入前调用有效性检查。下载父目录须存在，默认不覆盖已有文件；只有用户明确要求替换时启用 `overwrite=true`。传输失败时清理临时文件并保留原文件；目录变化或会话失效导致宿主拒绝落盘时停止操作，不绕过宿主边界重试。原生传输只接受 HTTPS 公网地址，不跟随重定向，单次限时 10 分钟。签名 URL 不写入日志或技能文件。
## 原生工具调用顺序

### 上传

1. 调 `lark-project__attachment_upload`，只传用户点名的 `source_path`。可选 `file_name` 仅在用户指定显示名称时使用，`mime_type` 仅在确知文件类型时覆盖；默认根据源文件路径的扩展名推断，忽略扩展名大小写，显示名称不改变 MIME。自动推断使用 `mime` 包内置类型表，返回不含 charset 等参数的类型；未知类型返回 `application/octet-stream`。返回 `status=inspected`、真实 `file_name`、`size`、`mime_type` 和 `file_fingerprint`，此时尚未上传。
2. 按上表确定场景并确认目标：仅 `resource_type=15` 执行下文的附件字段消歧，`16` 验证富文本字段，`13/14` 不查附件字段。调用 MCP `lark-project__upload_file`：使用检查返回的文件名、大小、MIME，加上当前目标的 `project_key`、`resource_type`、`work_item_id` 或 `work_item_type`、仅 `15/16` 所需的 `field_key`。不能估算大小、凭空生成 file_token 或预先假设单次/分片。各平台使用相同映射，不读取系统 MIME 文件或注册表；个别类型可能与使用系统配置的官方 CLI 不同。特殊类型可明确传入 `mime_type`，检查和执行时保持一致。
3. 从 MCP 返回中提取业务计划（解开 `content` 或 `data` 等宿主封装），将完整 `sign`、`upload_url`、`is_multipart`、`multipart` 和非空 `target_unit_code` 原样作为 `upload_plan`，再次调用 `lark-project__attachment_upload`。传同一 `source_path`、同一文件名/MIME 覆盖项，以及前次指纹作为 `expected_fingerprint`。源文件变更时重新检查并申请计划。
4. 原生工具按 `multipart.need` 顺序发送原始字节，范围两端均包含；末片读取到文件结束。只有完成传输且末片确认无未上传分片、返回非空 `file_token` 时，才返回 `status=uploaded`。
5. 使用真实上传结果绑定字段、评论或富文本；按下文回读目标验收。传输成功不等于绑定完成。绑定失败时先检查业务状态，不能直接重复上传造成重复文件。

文件检查示例：

```json
{
  "name": "lark-project__attachment_upload",
  "arguments": {"source_path": "/workspace/report.pdf"}
}
```

传输调用形状如下，所有占位值必须替换为本次真实结果；分片计划还须完整传入 `multipart`：

```json
{
  "name": "lark-project__attachment_upload",
  "arguments": {
    "source_path": "/workspace/report.pdf",
    "expected_fingerprint": "<检查返回的file_fingerprint>",
    "upload_plan": {
      "sign": "<upload_file返回的sign>",
      "upload_url": "<upload_file返回的upload_url>",
      "is_multipart": false
    }
  }
}
```

### 下载

1. 从本次业务查询取得真实 `file_url`，并验证空间和工作项目标。
2. 调 MCP `lark-project__get_download_url` 申请计划；取得计划不等于下载成功。
3. 把业务计划作为 `download_plan`，加上用户指定的 `output_path`，调用 `lark-project__attachment_download`。分片下载按 `0..part_count-1` 顺序拼接，每片必须带有与请求匹配的 `X-Meego-File-Sign` 响应头；缺失或不匹配即失败。
4. 只有 `status=downloaded` 时交付返回的真实 `path` 和 `size`。工具会先写独立临时文件，完整成功后再落到目标路径；不会根据服务器提供的文件名改写保存位置。

```json
{
  "name": "lark-project__attachment_download",
  "arguments": {
    "output_path": "/workspace/report.pdf",
    "download_plan": {
      "sign": "<get_download_url返回的sign>",
      "download_url": "<get_download_url返回的download_url>",
      "is_multipart": false
    }
  }
}
```

## 写入前门禁

### 1. 校验本地文件

- 对用户点名的每个路径逐一确认：文件存在、是普通文件、可读，且 basename 与用户要求一致。
- 本地文件不存在时立即停止并请用户补充或确认。**禁止自动替换成同名的其他文件，禁止擅自替换文件扩展名**（例如请求 `ad.png` 时改传 `ad.mp4`）。

### 2. 附件字段消歧（仅 `resource_type=15`）

向工作项附件字段写入时，必须针对**当前空间 + 当前工作项类型**调用 `lark-project__list_workitem_field_config`，使用 `field_types=["file","multi-file"]`、`page_num=1` 实时查询附件字段；若返回 `pagination.has_more=true`，继续递增页码，直到收集完所有页后再消歧。此过滤不用于评论或富文本图片。然后按以下顺序确定目标：

1. 用户明确给出字段 key：只接受精确 key 匹配。
2. 用户明确给出字段名：只接受精确字段名匹配；模糊结果只能用于展示候选。字段名精确匹配后仍有多个候选时，列出每个候选的 key 和类型，让用户按 key 选择。
3. 用户只说“附件”：若仅有一个候选可直接使用；若有多个候选，列出字段名、key、类型并让用户选择。

禁止选择第一个候选，禁止复用历史会话中的字段，禁止把 `attachment` 或 `multi_attachment` 当作固定 key。执行前记录 `target_field_key`、字段名和 `field_type`，后续上传、写入与验收必须始终使用同一个 key。

元数据中存在某字段，只能证明 API 可以识别它，**不能证明该字段已放入用户当前详情页布局或在 UI 可见**。没有布局查询能力时，应明确把结论限定为“API 目标字段写入并回读成功”。

### 3. 区分附件字段协议（仅 `resource_type=15`）

`file` 与 `multi-file` 不是可无条件互换的协议：

- `multi-file` 使用 stringified 文件对象数组，支持按下文协议维护多个附件。
- `file` 可能是旧版或单附件字段；只有当前空间的实际写入与回读已经验证其行为时，才可按其已验证能力操作。不得仅凭字段名或历史经验宣称它支持多附件。
- `lark-project__get_workitem_brief` 回读的文件对象可能比上传结果多出 `uid`、`url` 或其他服务端字段。后续合并时必须原样保留这些未知字段，不能把旧对象降级为只有 `name/type/size/fileToken` 的简化对象。

## 附件字段端到端写入协议（仅 `resource_type=15`）

上传成功后，把返回值映射为字段对象：

```json
{"name":"a.pdf","type":"application/pdf","size":"12345","fileToken":"<token>"}
```

其中 `type` 来自上传结果的 `mime_type`，`fileToken` 来自 `file_token`，`size` 写成十进制字符串；整个数组还要再次 JSON.stringify 后作为 `field_value`。

### 单附件

1. 通过已消歧的 `target_field_key` 上传文件，获得真实 `file_token`。
2. 创建工作项、目标字段当前为空，或用户明确要求替换时，可调 `lark-project__create_workitem` / `lark-project__update_field` 直接写入单元素数组。
3. 向已有 `multi-file` 字段**新增一个附件**时也必须先调 `lark-project__get_workitem_brief`：记录基线数量，原样保留当前完整数组，追加新对象后再调 `lark-project__update_field`。不得因为这次只新增一个文件就覆盖旧数组。`file` 字段仍按上面的兼容性规则处理。
4. 立即调 `lark-project__get_workitem_brief` 回读**同一个目标字段**，按文件名和数量做写后验收。追加语义下预期数量为“基线数量 + 1”；不能只检查上传返回值，也不能回读另一个附件字段。

### 同一 `multi-file` 字段写入多个附件

可靠路径是**单附件落库后逐个追加**，不要把“创建时一次传入多个简化对象”作为默认协议：

1. 创建场景先上传并随 `lark-project__create_workitem` 写入第一个附件，拿到工作项 ID；剩余附件改用该 ID 逐个处理。已有工作项直接从下一步开始。
2. 每追加一个文件前，先调 `lark-project__get_workitem_brief` 读取 `target_field_key` 的当前完整数组。
3. 上传一个新文件；将当前数组中的旧对象**原样保留**（包括 `uid`、`url` 及未知字段），只在数组末尾加入这一个新文件对象。
4. stringify 整个新数组并调 `lark-project__update_field` 覆盖目标字段；随后再次回读确认这一轮新增文件已出现。
5. 对剩余文件重复 2–4。最终比较用户请求的文件名多重集和数量：创建语义下等于请求总数，追加语义下等于“基线数量 + 成功新增数”；token 可能被服务端重签，不能把 token 完全相等作为唯一验收条件。

如果一次写入多个简化对象触发 `unique` 校验，直接切换到上述逐个追加协议；不得删除已成功落库的附件后盲目重试。更新是覆盖语义，不先读取并保留旧数组会导致已有附件丢失。

## 附件字段写后验收清单

- 回读的是已消歧并实际写入的 `target_field_key`。
- 单附件：目标文件名存在，目标字段数量符合预期。
- 多附件：请求的每个文件名都存在，重复文件按用户意图计数，总数符合预期。
- API 验收通过但无法验证页面布局时，如实说明 UI 可见性未验证，不把它包装成 UI 成功。

## 评论附件与图片（`resource_type=13/14`）

1. 验证已有工作项及用户要发布的评论内容。申请签名时传 `work_item_id`，不传 `field_key`，不执行 `file/multi-file` 字段查询或选择。
2. 执行原生上传，取得真实 `file_token` / `file_url`，按 `lark-project__add_comment` 的实时 schema 和内容协议绑定附件或图片。只使用实际支持的参数或引用格式，不自行添加未提供的 token 参数；只有 token 且没有已确认的绑定方式时，说明上传完成但评论尚未发布，不编造 URL。
3. 调用 `lark-project__add_comment` 后，用 `lark-project__list_workitem_comments` 回读本次评论，核对工作项、评论内容及附件/图片引用。不要改查附件字段作为验收，也不要修改已有附件字段。
4. 评论提交超时或结果未知时，先查询评论确认是否已发布；不能直接重复提交。

## 富文本字段图片（`resource_type=16`）

1. 按当前空间、工作项类型和用户指定的字段 key/名称查询 `lark-project__list_workitem_field_config`，核对字段支持富文本图片；有多个匹配时先消歧。不要使用 `field_types=["file","multi-file"]` 过滤，也不要把附件字段 key 作为富文本目标。
2. 记录目标 `field_key`。已有工作项先用 `lark-project__get_workitem_brief` 读取该字段的完整内容；新增图片时保留已有文字、图片及元数据，只有用户明确要求替换时才替换原内容。
3. 申请上传计划时传 `resource_type=16` 和已确认的 `field_key`，执行原生上传后，按 [rich-text-editor-markdown-syntax.md](rich-text-editor-markdown-syntax.md) 及当前工具支持的图片引用协议构造内容。只使用真实上传结果中的有效引用，不把文件 token 或临时下载签名 URL 猜成持久图片地址；没有可用引用时保留上传结果并说明绑定未完成。
4. 已有工作项通过 `lark-project__update_field` 写回同一字段；随新工作项创建时通过 `lark-project__create_workitem` 设置该字段。不要写入附件字段专用的 `name/type/size/fileToken` 数组。
5. 用 `lark-project__get_workitem_brief` 回读同一富文本字段，确认新图片引用存在且应保留的原内容仍在。写入结果未知先回读，不重复覆盖。

## lark-project__upload_file
申请上传签名。`work_item_id` 与 `work_item_type` **二选一必填**：已有工作项传 `work_item_id`；"创建工作项时同步上传附件" 场景传 `work_item_type`，两者同传时 `work_item_id` 优先。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| resource_type | number | 是 | 附件场景：13=评论附件 / 14=评论图片 / 15=工作项附件字段 / 16=富文本字段图片 |
| file_name | string | 是 | 附件名称 |
| mime_type | string | 是 | MIME 类型 |
| size | number | 是 | 文件总大小（字节）；后端据此判断走单次上传还是分片 |
| work_item_id | string | 二选一 | 已有工作项 ID |
| work_item_type | string | 二选一 | 工作项类型（仅 "创建工作项同步上传附件" 场景） |
| field_key | string | 条件 | `resource_type=15/16` 必填，13/14 不填 |

## lark-project__get_download_url
申请下载签名。`file_url` 是其它工具（如 `lark-project__get_workitem_brief` 的附件字段值、`lark-project__list_workitem_comments` 评论里的附件链接、富文本中的附件引用）回传的不透明引用，**不要**手工拼接。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_key | string | 是 | 空间 key |
| work_item_id | string | 是 | 工作项 ID |
| file_url | string | 是 | 附件 URL（来自附件字段、评论或富文本） |
