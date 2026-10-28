# 飞书项目

<img src="./assets/icon.png" alt="飞书项目" width="64" height="64" />

在 [OpenClaw](https://github.com/openclaw/openclaw) 中通过[飞书项目](https://project.feishu.cn/)官方 MCP 服务查询和管理项目数据。

## 安装

需要 OpenClaw 2026.10.8 或更新版本、Node.js `>=24.22.1 <25 || >=26.12.1`，以及具有相应项目权限的飞书项目账号。

```sh
openclaw plugins install lark-project
```

按提示确认安装 npm 来源的插件。

安装后，在 OpenClaw 插件页面打开 **飞书项目**，点击“连接”完成 OAuth 授权，再开启新会话。无需手动配置插件密钥、安装依赖或构建。

如果“连接”失败，可以告诉 Agent：“帮我连接飞书项目”。Agent 在 Gateway 机器上通过 OpenClaw CLI 发起登录，你完成账号登录和授权确认。远程浏览器也可完成授权后，将完整的本机回调 URL 通过私有会话交给 Agent 继续；该 URL 包含一次性授权码，不要公开分享。详见[授权指引](./skills/lark-project/references/auth-guard.md#agent-协助-oauth-授权)。

## 使用

直接告诉 Agent：

- “查询这个飞书项目工作项的详情。”
- “列出当前项目中尚未完成的需求。”
- “查看团队本周的排期。”

业务工具和项目操作权限由官方 MCP 服务及账号授权决定。写入操作会修改飞书项目中的内容。

插件附带 `lark-project` 技能，提供 MQL、字段格式、工作流和分页等使用指引，并按场景加载参考文档。来源和许可证见 [UPSTREAM.md](./skills/lark-project/UPSTREAM.md)。

插件还提供五个原生工具：

| 工具 | 功能 |
|---|---|
| `lark-project__url_decode` | 解析项目链接、页面类别和候选对象 ID |
| `lark-project__attachment_upload` | 检查本地文件，执行 MCP 返回的单次或分片上传计划 |
| `lark-project__attachment_download` | 执行 MCP 下载计划，校验文件签名并保存到本地 |
| `lark-project__workitem_batch_get` | 同一空间最多 200 个 ID 的批量只读查询，分别汇总成功和失败 |
| `lark-project__query_all` | 自动读取 MQL、游标或页码的后续页，保留每页数据并标记完整性 |

附件签名计划通过官方 MCP 获取，OAuth 由 OpenClaw 管理。上传后，Agent 继续绑定目标字段或评论并回读验收。文件路径位于 Gateway 所在机器，遵守宿主会话文件策略：优先使用 `fsPolicy.root`，否则使用 workspace；额外 `readOnlyRoots` 只允许上传读取，不允许下载写入；沙箱会话不提供附件原生工具。下载父目录须已存在，默认不覆盖已有文件。

两个查询编排工具复用当前 OpenClaw 会话已建立的 MCP 连接和 OAuth，先完成该会话的工具发现。每次调用重新核对当前工具目录、会话和请求者归属；会话失效或工具权限被收回时停止编排。只有 `summary.complete=true` 才表示本次分页完整；达到上限或失败时保留部分结果，可确定续查位置时返回 `continuation`，标明追加或替换哪一页。续查与合并规则见 [performance.md](./skills/lark-project/references/performance.md)。宿主 MCP runtime 暂无公开调用 SDK，兼容适配已验证 OpenClaw 2026.10.8；其他版本或运行方式未提供会话 runtime 时会明确报错，可继续使用官方 MCP 工具。

开发验证：先运行 `npm install`，再运行 `npm test`，无需构建。测试使用 Node.js 自带的 `node:test`，开发依赖固定 OpenClaw 2026.10.8 以验证宿主接口。原生实现使用 OpenClaw 的公开网络、文件安全及 JSON Schema 校验接口，需要宿主提供 `openclaw/plugin-sdk/security-runtime`。

MCP 服务地址：`https://project.feishu.cn/mcp_server/v1`。

本项目是第三方集成，非飞书项目官方插件。

## 许可证

MIT。上游代码及测试样例的许可证见[许可证文件](./LICENSES/meegle-cli.txt)。MIME 类型查询使用 MIT 许可的 [mime](https://github.com/broofa/mime) 包。
