# openclaw-lark-project

[OpenClaw](https://github.com/openclaw/openclaw) 插件，用于通过飞书项目 OpenAPI 更新工作项字段。

## 安装

```bash
openclaw plugins install openclaw-lark-project
```

## 配置

| 参数           | 必填 | 说明                                  |
| -------------- | ---- | ------------------------------------- |
| `pluginId`     | ✅   | 飞书项目插件 ID，例如 `cli_xxx`       |
| `pluginSecret` | ✅   | 飞书项目插件密钥                      |
| `userKey`      | ✅   | 用户标识，例如 `ou_xxx` 或 `user_xxx` |

## 工具

### `update_workitem_description`

更新工作项描述字段（用于补充 MCP `update_field` 在描述字段上的限制）。

**参数：**

| 参数             | 必填 | 说明                                                                           |
| ---------------- | ---- | ------------------------------------------------------------------------------ |
| `description`    | ✅   | 要写入的描述内容（支持 markdown）                                              |
| `url`            |      | 工作项详情页 URL，可自动解析 `project_key` / `work_item_type` / `work_item_id` |
| `project_key`    |      | 项目标识（不传 `url` 时需要）                                                  |
| `work_item_type` |      | 工作项类型，如 `story` / `issue` / `bug`                                       |
| `work_item_id`   |      | 工作项 ID（不传 `url` 时需要）                                                 |
| `field_key`      |      | 默认 `description`，仅在使用自定义字段 key 时传入                              |

**示例：**

```json
{
  "url": "https://project.feishu.cn/6497ba7bfbdf459fb32b428d/story/detail/6856187236",
  "description": "## 更新说明\n\n通过插件工具更新描述字段。"
}
```

## 开发

```bash
pnpm install
pnpm test
```

## 许可证

MIT
