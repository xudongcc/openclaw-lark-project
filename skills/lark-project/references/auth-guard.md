# 认证与当前用户

## 触发条件

用户要求连接飞书项目、查询或修改业务数据时，先确认当前会话可用工具和连接身份。用户提供 URL 时，先调用 `lark-project__url_decode`，保留原始 host 与结构化候选字段；解析本身不需要 OAuth。

## STEP 1 — 固定目标环境

本插件默认连接 `https://project.feishu.cn/mcp_server/v1`。已有 URL 的 host 应与当前 MCP 环境一致：域名忽略大小写和末尾的点，端口必须匹配；无 host 的绝对路径只能在已确认的连接上下文中使用。

其他 Meegle 站点、自定义域名或端口先确认环境与连接，不能拿飞书项目环境的成功查询证明另一环境有权限。保留原链接 host，不用登录状态覆盖它，也不从上一请求继承站点。

## STEP 2 — 使用当前 OAuth 连接

1. 查看本会话实际提供的 `lark-project__` MCP 工具与输入 schema。工具存在只证明能力已发现，查询成功才是当前账号可以访问具体对象的证据。
2. 工具未出现或连接提示未授权时，可引导用户在插件页面点击“连接”；用户要求 Agent 协助授权，或 Web UI 授权失败时，按下节使用 OpenClaw CLI。完成后重新发现工具或开启会话。只有观察到实际连接成功结果时才报告授权成功。
3. 不索取、读取、导出或手工保存 Access Token、Refresh Token、客户端密钥，不直接修改 OAuth 数据库。收到 401 或认证失效时停止业务调用，完成重新连接后再恢复；无权限不等于未登录，不通过反复登录绕过项目权限。
4. 复用本轮已验证的连接，继续用户已授权的任务；不为每个业务调用虚构授权状态查询工具。

### Agent 协助 OAuth 授权

使用 **OpenClaw 自带的 `openclaw mcp login`**。CLI 与插件通过相同服务器名称、URL 复用 OpenClaw 管理的 OAuth 凭据；业务操作仍走插件 MCP。

Web UI 无法完成授权时，可使用 CLI 的 HTTP 本机回调 `http://127.0.0.1:8989/oauth/callback`。这个端口由 CLI 临时监听，不是 Gateway 服务端口。使用 CLI 生成的原始授权链接，保持客户端注册、授权和换取凭据时的回调地址一致。

#### 1. 确认执行位置和配置

- 在 **Gateway 所在机器**执行，CLI 与 Gateway 使用相同用户、profile 和配置。需要宿主终端和配置修改权限；不具备时请维护者协助。
- 这是 operator 级共享授权，不是聊天用户的个人连接。确认用户有权管理此连接，不覆盖其他用户的授权。
- 确认插件已启用，查看 `openclaw mcp show lark-project --json`。部分版本的 CLI 不识别插件自带声明，显示不存在时可临时添加同名配置，不是再次安装插件。
- 备份实际配置文件并限制备份权限，记录原来是否有手动定义；确认 `127.0.0.1:8989` 未被占用，不停止其他服务。

**仅在原来没有手动定义时**，添加与插件同名、同 URL 的临时配置：

```sh
openclaw mcp add lark-project \
  --url https://project.feishu.cn/mcp_server/v1 \
  --transport streamable-http \
  --auth oauth \
  --oauth-redirect-url http://127.0.0.1:8989/oauth/callback \
  --no-probe
```

已有定义时，核对 URL、认证方式和身份模式；不同环境或 `per-requester` 连接不能套用此流程。同环境的 operator 连接仅在获准后临时调整回调，记录待恢复的字段，不用上述命令覆盖。

#### 2. 发起登录并保留进程

```sh
openclaw mcp login lark-project
```

保留 CLI 交互进程及其执行结果，记录本次输出的授权 URL、`state` 和回调地址，确认监听已启动；不要并发发起多次登录。

把原始授权链接交给用户，由用户选择账号、登录并确认授权。不索取密码或验证码，不改写链接中的 `client_id`、PKCE、`state` 或回调参数。

#### 3. 本机或远程完成回调

- **本机浏览器**：用户在 Gateway 机器打开授权链接，完成后自动回到 CLI 监听器。
- **远程浏览器**：用户可在手机或另一台电脑登录。回调中的 `127.0.0.1` 指向远程设备，页面连接失败不等于授权失败；请用户将地址栏中的**完整回调 URL**通过当前受信任的私有会话交给 Agent。说明其中包含一次性授权码，不要公开分享。

远程回调由 Agent 在 Gateway 机器上提交。先用 URL 解析器确认：协议、主机、端口、路径与本次 CLI 回调完全相同；无用户名、密码或 fragment；恰好一个非空 `code`，恰好一个与本次授权链接一致的 `state`；有 `error` 时停止。

验证通过后，仅向 CLI 正在监听的固定本机地址发送 GET，用 URL 参数编码传入 `code` 和 `state`；绕过 HTTP 代理、不跟随重定向、隐藏响应正文。不要请求任意用户 URL，或在回复、持久文件、调试日志中回显授权码和完整回调 URL。等待 CLI 输出 `MCP OAuth credentials saved for "lark-project"`；回调 HTTP 200 本身不代表换取凭据成功。

用户取消、CLI 已结束、超时、状态不匹配或换取凭据失败时，停止本轮并说明失败阶段。重试时新建登录会话，不复用旧授权码或混用不同会话的参数。

#### 4. 验证并清理临时配置

CLI 保存成功后，执行只读连接验证：

```sh
openclaw mcp probe lark-project --json
```

确认真实连接成功且发现 MCP 工具。业务权限需在用户授权范围内另做最小只读查询，不能用写入操作测试登录。

结束本轮时，关闭自己仍在等待的 CLI 进程，恢复本轮配置变更。**仅当本轮新增了整个手动定义时**，用以下命令删除它，恢复插件定义：

```sh
openclaw config unset mcp.servers.lark-project
```

不要使用 `openclaw mcp unset lark-project`、`mcp logout`、`--clear-auth` 或删除凭据文件，这些操作会清除授权。原来已有手动定义时，只恢复本轮调整的字段，保留并发配置变更，不删除定义或整份覆盖备份。

清理后确认插件仍启用，重新发现 MCP 工具并检查连接；当前会话无法刷新时，请用户新开会话验证，不再次注册。分别报告授权、连接验证和清理结果。

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
