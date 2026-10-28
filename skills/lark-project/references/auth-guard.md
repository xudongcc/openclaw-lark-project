# 认证与当前用户

## 触发条件

用户要求连接飞书项目、查询或修改业务数据时，先确认当前会话可用工具和连接身份。用户提供 URL 时，先调用 `lark-project__url_decode`，保留原始 host 与结构化候选字段；解析本身不需要 OAuth。

## STEP 1 — 固定目标环境

本插件默认连接 `https://project.feishu.cn/mcp_server/v1`。已有 URL 的 host 应与当前 MCP 环境一致：域名忽略大小写和末尾的点，端口必须匹配；无 host 的绝对路径只能在已确认的连接上下文中使用。

其他 Meegle 站点、自定义域名或端口先确认环境与连接，不能拿飞书项目环境的成功查询证明另一环境有权限。保留原链接 host，不用登录状态覆盖它，也不从上一请求继承站点。

## STEP 2 — 使用当前 OAuth 连接

1. 查看本会话实际提供的 `lark-project__` MCP 工具与输入 schema。工具存在只证明能力已发现，查询成功才是当前账号可以访问具体对象的证据。
2. 工具未出现或连接提示未授权时，可引导用户在插件页面点击“连接”；用户要求 Agent 协助授权，或 Web UI 授权失败时，按下节使用 OpenClaw CLI。完成后重新发现工具或开启会话。只有观察到实际连接成功结果时才报告授权成功。
3. 不索取、读取、导出或手工保存 Access Token、Refresh Token、客户端密钥，不迁移飞书官方 CLI 的凭据，不直接修改 OAuth 数据库。收到 401 或认证失效时停止业务调用，完成重新连接后再恢复；无权限不等于未登录，不通过反复登录绕过项目权限。
4. 复用本轮已验证的连接，继续用户已授权的任务；不为每个业务调用虚构授权状态查询工具。

### Agent 协助 OAuth 授权

此流程使用 **OpenClaw 自带的 `openclaw mcp login`**，不是安装或调用 `meegle-cli`。CLI 与插件以相同服务器名称、URL 使用 OpenClaw 管理的 OAuth 凭据，业务操作仍通过插件 MCP。

2026-10-28 在 OpenClaw 2026.10.8 上验证：飞书注册接口拒绝本次测试的公网 HTTPS 回调，返回 HTTP 200 但业务错误码 `1000053836`、无 `client_id`；`http://127.0.0.1:8989/oauth/callback` 注册成功并完成真实授权与 MCP 工具发现。Web UI 在该版本使用当前页面入口生成 `/oauth/provider/callback`，会覆盖 MCP 中配置的回调地址。不能通过备案、修改授权链接中的 `redirect_uri`，或直接换成 Gateway 的 `18789` 端口来假定已解决。错误码的官方含义和完整回调允许规则尚未确认；不要把这次观测推广为所有站点、版本的规则。

#### 1. 确认执行位置和配置

- 在 **Gateway 所在机器**执行，并确认 CLI 使用与 Gateway 相同的用户、profile 和配置。Agent 无宿主终端或配置修改权限时，请维护者协助，不绕过限制。
- 此处是 operator 级共享连接，不是自动为每个聊天用户建立个人授权。先确认用户有权管理该连接；已有其他用户的授权时，不擅自覆盖。
- 确认 `lark-project` 插件已启用，查看 `openclaw mcp show lark-project --json`。OpenClaw 2026.10.8 的 CLI 只识别 `mcp.servers`，因此插件自带的 MCP 可能显示不存在，并不代表插件未安装。
- 修改前备份实际配置文件，记录原来是否存在手动定义；备份包含敏感配置，限制文件权限，不上传或输出其内容。检查 `127.0.0.1:8989` 未被其他进程占用，不停止不相关服务。

**仅在原来没有手动定义时**，添加与插件同名、同 URL 的临时配置：

```sh
openclaw mcp add lark-project \
  --url https://project.feishu.cn/mcp_server/v1 \
  --transport streamable-http \
  --auth oauth \
  --oauth-redirect-url http://127.0.0.1:8989/oauth/callback \
  --no-probe
```

已有手动定义时，核对 URL、认证方式和 OAuth 身份模式。不同环境或 `per-requester` 连接不能套用此共享授权流程。同环境的 operator 连接也须保留原设置，只在获准后临时调整回调，结束时恢复；不要用上述命令覆盖已有定义。

#### 2. 发起登录并保留进程

```sh
openclaw mcp login lark-project
```

用宿主执行工具保留这个交互进程，记录本次实际输出的授权 URL、`state` 和回调地址，并确认本机回调监听已启动。不要后台启动后丢弃进程结果，也不要重复运行多个并发登录。

把本次生成的飞书授权链接交给用户，由用户登录并确认授权；不索取密码、验证码或代替用户选择账号。链接由 CLI 生成，不能改写其中的 `client_id`、PKCE、`state` 或回调参数。

#### 3. 本机或远程完成回调

- **本机浏览器**：用户在 Gateway 所在机器打开授权链接，完成后自动回到 CLI 的 loopback 监听器。
- **远程浏览器**：用户也可在手机或另一台电脑完成登录。跳转后的 `127.0.0.1` 指向那台设备，页面连接失败不等于授权失败；请用户将地址栏中的**完整回调 URL**通过当前受信任的私有会话交给 Agent。先说明其中包含一次性授权码，不要公开分享；不需要提供 Access Token 或 Refresh Token。

远程回调由 Agent 在 Gateway 机器上转交给仍在等待的 CLI。提交前用 URL 解析器核对：协议、主机、端口和路径与本次 CLI 输出的 loopback 回调完全相同；无用户名、密码或 fragment；恰好一个非空 `code`，恰好一个 `state` 且与本次授权链接一致；有 `error` 时停止。不要直接请求用户提供的任意 URL，也不要跟随重定向。

验证通过后，只向本次监听的固定本机回调地址发送 GET，将解析后的 `code`、`state` 用 URL 参数编码传入。绕过 HTTP 代理，隐藏响应正文，不在回复、持久文件或调试日志中回显授权码、完整回调 URL 或令牌。让 CLI 校验状态并换取、保存凭据；本机回调 HTTP 200 只表示收到回调，还须等待 CLI 明确输出 `MCP OAuth credentials saved for "lark-project"`。

用户取消、进程已结束、监听超时、状态不匹配、授权码过期或换取凭据失败时停止本轮，不转发到其他地址、不反复消费旧授权码。说明具体失败阶段；需要重新授权时生成新的登录会话，不能拼接旧 `state` 和新授权码。

#### 4. 验证并清理临时配置

CLI 保存成功后，执行只读连接验证：

```sh
openclaw mcp probe lark-project --json
```

确认真实连接成功且发现 MCP 工具；工具数量可能变化，不硬编码为 48。需要判断业务权限时，再在用户授权范围内做最小只读查询。不要通过创建工作项、评论或上传文件测试登录。

无论本轮成功、取消还是失败，都终止自己仍在等待的 CLI 进程，并收尾自己创建的临时配置；不影响其他进程或已有定义。**仅当本轮新增了整个手动定义时**，使用通用配置命令删除它，使插件定义重新生效：

```sh
openclaw config unset mcp.servers.lark-project
```

不要使用 `openclaw mcp unset lark-project`、`mcp logout`、`--clear-auth` 或删除凭据文件：2026.10.8 的 MCP 专用 unset 会清除 OAuth 凭据，即使插件仍提供同名服务器。原来已有手动定义时，仅恢复本轮调整的字段，保留其他并发配置变更，不删除定义或整份覆盖备份。

清理后确认插件仍启用，重新发现插件 MCP 工具并检查连接；不为检查而再次点击 Web UI“连接”或重新注册。若 Agent 无法刷新当前会话工具，明确请用户新开会话验证，不宣称已完成业务权限验收。报告授权、连接验证及清理各自的实际结果；不把安装成功、授权页面打开或回调收到单独当作登录成功。

## STEP 3 — 解析当前用户

查询个人待办优先用 `lark-project__list_todo`，MQL 可在合法表达式位置使用 `current_login_user()`。

需要实际 `user_key` 时，使用官方当前身份查询的底层调用：

```json
{
  "name": "lark-project__search_user_info",
  "arguments": {"user_keys": ["current_login_user()"]}
}
```

这里的函数文本是该查询特有的身份标记。检查实际 schema 和真实结果，取得唯一的当前用户记录后才提取 `user_key`；不得把该标记直接传给人员字段、节点负责人或 `lark-project__get_transitable_states.user_key`。查询未解析标记、结果为空或不唯一时停止推断，不能从候选名单猜当前用户。

## STEP DONE — 执行业务流程

URL 的 `simple_name` 仍须经 `lark-project__search_project_info` 转为权威 `project_key`，再验证工作项、视图、图表等具体目标。按 [url-kinds.md](url-kinds.md) 选择 SOP，不能把视图或主页直接当成单个工作项。

附件先通过已授权 MCP 获取签名计划，原生工具再传输文件；绑定字段或评论仍走 MCP。批量和分页工具只复用当前会话已建立并已发现工具的宿主 MCP runtime；runtime 不兼容或不存在时按 [performance.md](performance.md) 回到现有官方 MCP 工具，不另行登录。
