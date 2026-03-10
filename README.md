# openclaw-lark-project

[OpenClaw](https://github.com/openclaw/openclaw) 插件，用于管理[飞书项目](https://project.feishu.cn)工作项。通过单一 MCP 工具 `lark_project` 提供工作项全生命周期管理能力，包括创建、查询、字段更新、评论管理、工作流转、MOQL 查询和人员排期分析。

## 架构

```
┌──────────────────────────────────────────────────┐
│                   OpenClaw 运行时                  │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │          lark_project 工具（action 路由）      │  │
│  │                                              │  │
│  │  ┌──────────────────┐ ┌───────────────────┐  │  │
│  │  │ LarkProjectClient │ │ LarkProjectMCP    │  │  │
│  │  │   (OpenAPI SDK)  │ │ Client (MCP SDK)  │  │  │
│  │  └────────┬─────────┘ └────────┬──────────┘  │  │
│  └───────────┼────────────────────┼─────────────┘  │
└──────────────┼────────────────────┼────────────────┘
               ▼                    ▼
     飞书项目 OpenAPI          飞书项目 MCP Server
    (16 个 action)            (search_by_mql,
                               get_schedule)
```

- **LarkProjectClient**（OpenAPI SDK）：封装 `plugin_access_token` 鉴权，处理工作项 CRUD、字段更新、评论、工作流转等 16 个操作。
- **LarkProjectMCPClient**（MCP SDK）：通过 Streamable HTTP 连接飞书项目 MCP Server，封装 `search_by_mql` 和 `get_schedule` 两个操作。

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

本插件注册单一 MCP 工具 `lark_project`，通过 `action` 字段进行功能路由。支持以下 18 个操作：

### 工作项查询与管理

| Action                 | 说明                                     |
| ---------------------- | ---------------------------------------- |
| `get_work_item`        | 获取工作项完整详情（自动推断工作项类型） |
| `create_work_item`     | 创建新工作项，支持模板和自定义字段       |
| `abort_work_item`      | 终止或恢复工作项                         |
| `get_work_item_schema` | 获取工作项类型的可用字段与角色定义       |

### 字段与角色更新

| Action                         | 说明                                      |
| ------------------------------ | ----------------------------------------- |
| `update_work_item_field`       | 更新任意字段（优先级、描述、业务线等）    |
| `update_work_item_role_owners` | 覆盖更新角色人员名单                      |
| `get_businesses`              | 获取空间下业务线列表（用于获取业务线 ID） |

### 评论管理

| Action                     | 说明           |
| -------------------------- | -------------- |
| `create_comment` | 添加纯文本评论 |
| `get_comments`  | 查询评论列表   |
| `update_comment` | 更新指定评论   |
| `delete_comment` | 删除指定评论   |

### 工作流转

| Action                   | 说明                   |
| ------------------------ | ---------------------- |
| `get_work_item_workflow` | 获取节点流或状态流详情 |
| `confirm_node`           | 完成节点（节点流）     |
| `rollback_node`          | 回滚节点（节点流）     |
| `change_state`           | 状态流转（状态流）     |

### 批量与视图查询

| Action            | 说明                                       |
| ----------------- | ------------------------------------------ |
| `get_view_detail` | 获取视图下的工作项列表及完整详情           |
| `search_by_mql`   | 使用 MOQL 进行复杂条件查询，支持分页       |
| `get_schedule`   | 查询多用户在指定时间区间的排期与工作量明细 |

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
├── index.ts                    # 插件入口，工具注册与 action 路由
└── client/
    ├── client.ts               # 飞书项目 OpenAPI SDK
    ├── client.test.ts          # OpenAPI SDK 测试
    ├── mcp-client.ts           # 飞书项目 MCP 客户端
    ├── mcp-client.test.ts      # MCP 客户端测试
    └── types/                  # TypeScript 类型定义
```

## 许可证

MIT
