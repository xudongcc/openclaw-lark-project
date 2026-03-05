# openclaw-lark-project (OpenAPI Supplement)

这个插件用于补充官方 `lark-project` MCP 在某些字段写入上的限制。
当前仅启用一个工具：`update_workitem_description`。

## 使用 pnpm
```bash
pnpm install
```

## 配置项
- `pluginId`
- `pluginSecret`
- `userKey`
- `baseUrl`（可选，默认 `https://project.feishu.cn`）

## 已启用工具
- `update_workitem_description`

用途：更新工作项「描述」字段（默认 `field_key=description`）。

## 输入参数
- `description`（必填）
- `url`（可选，详情页 URL，可自动解析 `project_key` / `work_item_type` / `work_item_id`）
- `project_key`（可选，若不传 `url` 则建议传）
- `work_item_type` / `work_item_type_key`（可选，若不传 `url` 则必传其一）
- `work_item_id`（可选，若不传 `url` 则必传）
- `field_key`（可选，默认 `description`）

## 示例
```json
{
  "url": "https://project.feishu.cn/6497ba7bfbdf459fb32b428d/story/detail/6856187236",
  "description": "## 更新说明\n\n通过插件工具更新描述字段。"
}
```

## 说明
- 本插件走飞书项目 OpenAPI，使用 `X-PLUGIN-TOKEN + X-USER-KEY`。
- 该工具是针对 MCP `update_field` 在描述字段报错时的兜底能力。
