# 来源与适配

本目录从 [官方 skills/meegle](https://github.com/larksuite/meegle-cli/tree/51b6c92fe7bab9f830db9f4bbf2739927c434815/skills/meegle) 原版重新导入，并针对 OpenClaw 插件的实际接口适配。

- 上游提交：`51b6c92fe7bab9f830db9f4bbf2739927c434815`；已核对当前官方 HEAD。
- 保留业务域、六份 MQL 主题文档、富文本规范和四份 SOP 的分层结构。
- `cli-guide.md` 改为 `mcp-guide.md`；`ai-handoff.md` 改为 `capabilities.md`。其余参考文件保持官方文件名与业务职责，共 26 份。
- 官方 48 个业务工具按同一提交 `internal/products/meegle/dynamic/mapper.go` 映射；示例改为 `lark-project__` 完整工具名与结构化 JSON 参数。
- URL、批量读取、分页和附件文档按本插件五个原生工具的实际 schema、返回结构与边界适配；附件保留“签名计划 → 文件传输 → 绑定 → 回读”，分页保留逐页数据与不完整标记。
- OAuth 由 OpenClaw 连接管理；当前用户查询按 `registry.go` 中身份快捷操作的底层 `search_user_info` 调用，不新增身份工具。
- 不复制 CLI 登录、profile、终端参数序列化、偏好设置与站外 AI 跳转流程；分析在当前 Agent 会话完成。
- 保留已核实的业务协议纠正：缺失业务值不编造，人员参数使用真实 userkey，资源语义不混用，覆盖写入保留已有数据，写入结果未知先回读。

源码核对与适配边界：

- `mcpclient/response.go`：错误合并所有业务文本；成功读取第一段业务文本；`log_id:` / `logid:` 的最后一个值作为追踪 ID。原生读取编排额外保留 structuredContent 支持、大整数精度校验和认证终止；不接受无法用于分页的非 JSON 成功结果。
- 官方错误结构不读取 `structuredContent`，认证判断主要依赖 HTTP 401 与刷新失败。插件对结构化诊断和文本统一分类，再脱敏与截断展示；普通文本不能抹除结构化诊断中的认证失效，即使服务端使用自定义错误码。
- 官方附件源码直接使用 `os.Open` / `os.Create` / `os.Rename`，没有 OpenClaw 的 `workspaceOnly` 边界。插件使用宿主公开安全文件接口打开源文件、通过支持 `overwrite` 与 `assertBeforeMutation` 的 `copyIn` 发布下载结果；下载先流式写入私有临时目录，再交由宿主执行工作区内文件操作，不自行增加文件安全后端。
- 附件 MIME 推断保留 `attachment/upload.go` 的源路径扩展名语义、无参数类型和未知类型回退，使用 npm `mime` 包的内置映射，忽略扩展名大小写。各平台结果一致，不读取 Go 所用的系统 MIME 文件或注册表，因此个别映射可能与官方 CLI 不同；可通过 `mime_type` 显式覆盖。
- 分页保留本插件的逐页返回协议，不复制 CLI 的扁平化输出。逐页检查 MQL 行数，续查显式返回 `merge_mode` 与 `page_index`；无法定位异常页时不提供推测的重试目标。合并步骤见 [performance.md](references/performance.md)。

- 附件门禁按 `resource_type` 分支：13/14 为评论，15 为附件字段，16 为富文本图片；仅 15 使用 file/multi-file 候选过滤，创建与更新 SOP 同步遵循这一边界。

OpenClaw 宿主适配以 [官方提交 98c56569b535c591332d749c4faea975bb176bc5](https://github.com/openclaw/openclaw/commit/98c56569b535c591332d749c4faea975bb176bc5) 为源码参考，并使用 npm `openclaw@2026.10.8` 验证：

- 文件策略采用 `fsPolicy.root` 和 `readOnlyRoots`，后者不授予写入权限；`root()` 与网络地址校验继续使用公开 `security-runtime` SDK。
- MCP 参数校验改用公开 `json-schema-runtime` SDK，不自动注入默认值。每次调用检查实时工具目录、会话归属和请求者身份，将宿主调用有效性检查传入最终请求。
- 会话复用集中在 `agent-bundle-mcp-manager-api` 兼容边界。这仍是内部入口，不承诺所有未来版本兼容；缺失时明确报错，不能自行启动连接、读取 OAuth 存储或切换身份。
- 原生工具声明工作区访问范围；只有附件执行阶段访问工作区。测试使用 Node.js 内置 runner，并通过本地模拟 MCP 服务验证真实宿主会话复用，不依赖生产账号。

上游版权为 Copyright (c) 2026 Lark Technologies Pte. Ltd.，按 MIT License 使用。完整许可证保留在 [LICENSE](LICENSE)。适配不代表上游官方发布或背书。
