# 认证与当前用户

## 触发条件

用户要求连接飞书项目、查询或修改业务数据时，先确认当前会话可用工具和连接身份。用户提供 URL 时，先调用 `lark-project__url_decode`，保留原始 host 与结构化候选字段；解析本身不需要 OAuth。

## STEP 1 — 固定目标环境

本插件默认连接 `https://project.feishu.cn/mcp_server/v1`。已有 URL 的 host 应与当前 MCP 环境一致：域名忽略大小写和末尾的点，端口必须匹配；无 host 的绝对路径只能在已确认的连接上下文中使用。

其他 Meegle 站点、自定义域名或端口先确认环境与连接，不能拿飞书项目环境的成功查询证明另一环境有权限。保留原链接 host，不用登录状态覆盖它，也不从上一请求继承站点。

## STEP 2 — 使用当前 OAuth 连接

1. 查看本会话实际提供的 `lark-project__` MCP 工具与输入 schema。工具存在只证明能力已发现，查询成功才是当前账号可以访问具体对象的证据。
2. 工具未出现或连接提示未授权时，引导用户在 OpenClaw 的飞书项目插件页面点击“连接”，完成 OAuth 后重新发现工具或开启会话。只有观察到实际连接成功结果时才报告授权成功。
3. 不索取、读取或保存 OAuth token，不调用终端登录命令。收到 401 或认证失效时停止业务调用，完成重新连接后再恢复；无权限不等于未登录，不通过反复登录绕过项目权限。
4. 复用本轮已验证的连接，继续用户已授权的任务；不为每个业务调用虚构授权状态查询工具。

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
