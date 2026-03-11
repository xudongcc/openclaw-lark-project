# openclaw-lark-project

[OpenClaw](https://github.com/openclaw/openclaw) 插件，用于管理[飞书项目](https://project.feishu.cn)工作项。通过 `lark_project_` 前缀的独立工具提供工作项全生命周期管理能力，包括创建、查询、字段更新、评论管理、工作流转和人员排期分析。

## 架构

```
┌──────────────────────────────────────────────────┐
│                   OpenClaw 运行时                  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │      lark_project_* 独立工具（21 个）         │  │
│  │                                              │  │
│  │  ┌──────────────────┐ ┌───────────────────┐  │  │
│  │  │ LarkProjectClient │ │ LarkProjectMCP    │  │  │
│  │  │   (OpenAPI SDK)  │ │ Client (MCP SDK)  │  │  │
│  │  └────────┬─────────┘ └────────┬──────────┘  │  │
│  └───────────┼────────────────────┼─────────────┘  │
└──────────────┼────────────────────┼────────────────┘
               ▼                    ▼
     飞书项目 OpenAPI          飞书项目 MCP Server
    (19 个工具)               (get_schedule)
```

- **LarkProjectClient**（OpenAPI SDK）：封装 `plugin_access_token` 鉴权，处理工作项 CRUD、字段更新、评论、工作流转等操作。
- **LarkProjectMCPClient**（MCP SDK）：通过 Streamable HTTP 连接飞书项目 MCP Server，封装排期查询。

## 安装

```bash
openclaw plugins install openclaw-lark-project
```

## 配置

| 参数           | 必填 | 说明                                                     |
| -------------- | ---- | -------------------------------------------------------- |
| `pluginId`     | ✅   | 飞书项目插件 ID，格式如 `MII_*`                          |
| `pluginSecret` | ✅   | 飞书项目插件密钥                                         |
| `userKey`      | ✅   | 用户标识（纯数字），例如 `7136000000000000676`           |
| `mcpKey`       | ✅   | MCP Key，格式如 `m-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

## 工具

本插件注册多个独立工具，命名规则 `lark_project_{资源}_{动作}`：

### 工作项查询与管理

| 工具名                                | 说明                                     |
| ------------------------------------- | ---------------------------------------- |
| `lark_project_work_item_get`          | 获取工作项完整详情（自动推断工作项类型） |
| `lark_project_work_item_create`       | 创建新工作项，支持模板和自定义字段       |
| `lark_project_work_item_abort`        | 终止或恢复工作项                         |
| `lark_project_work_item_schema_get`   | 获取工作项类型的可用字段与角色定义       |

### 字段与角色更新

| 工具名                                | 说明                                      |
| ------------------------------------- | ----------------------------------------- |
| `lark_project_work_item_update`       | 更新任意字段（优先级、描述、业务线等）    |
| `lark_project_work_item_role_update`  | 覆盖更新角色人员名单                      |
| `lark_project_business_list`          | 获取空间下业务线列表（用于获取业务线 ID） |

### 评论管理

| 工具名                          | 说明           |
| ------------------------------- | -------------- |
| `lark_project_comment_create`   | 添加纯文本评论 |
| `lark_project_comment_list`     | 查询评论列表   |
| `lark_project_comment_update`   | 更新指定评论   |
| `lark_project_comment_delete`   | 删除指定评论   |

### 工作流转

| 工具名                          | 说明                   |
| ------------------------------- | ---------------------- |
| `lark_project_workflow_get`     | 获取节点流或状态流详情 |
| `lark_project_node_confirm`     | 完成节点（节点流）     |
| `lark_project_node_rollback`    | 回滚节点（节点流）     |
| `lark_project_state_change`     | 状态流转（状态流）     |

### 视图与排期查询

| 工具名                          | 说明                                       |
| ------------------------------- | ------------------------------------------ |
| `lark_project_view_get`         | 获取视图下的工作项列表及完整详情           |
| `lark_project_schedule_get`     | 查询多用户在指定时间区间的排期与工作量明细 |

### 组织架构

| 工具名                          | 说明                           |
| ------------------------------- | ------------------------------ |
| `lark_project_user_get`         | 通过 ID/名称/邮箱获取单个用户 |
| `lark_project_user_list`        | 批量查询用户详情               |
| `lark_project_team_list`        | 获取空间团队人员列表           |

详细参数和使用范例请参考 [SKILL.md](./skills/lark-project/SKILL.md)。

## 开发

```bash
# 安装依赖
pnpm install

# 运行测试
pnpm test

# 监听模式
pnpm test:watch

# 代码覆盖率
pnpm test:coverage
```

### 环境变量

复制 `.env.example` 为 `.env` 并填入实际值：

```bash
LARK_PROJECT_PLUGIN_ID=
LARK_PROJECT_PLUGIN_SECRET=
LARK_PROJECT_USER_KEY=
LARK_PROJECT_MCP_KEY=
LARK_PROJECT_PROJECT_KEY=
```

### 项目结构

```
src/
├── index.ts                    # 插件入口，独立工具注册
└── client/
    ├── client.ts               # 飞书项目 OpenAPI SDK
    ├── client.test.ts          # OpenAPI SDK 测试
    ├── mcp-client.ts           # 飞书项目 MCP 客户端
    ├── mcp-client.test.ts      # MCP 客户端测试
    └── schemas/                # Zod schema 定义
```

## 许可证

MIT
