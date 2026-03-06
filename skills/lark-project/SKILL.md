---
description: 使用飞书项目 OpenAPI 管理工作项描述和评论
---

# lark-project

作为飞书项目 MCP 的补充能力，提供工作项描述更新和评论管理功能。

## 工具一览

| 工具                           | 用途               |
| ------------------------------ | ------------------ |
| `update_work_item_description` | 更新工作项描述字段 |
| `create_work_item_comment`     | 添加评论           |
| `list_work_item_comments`      | 获取评论列表       |
| `delete_work_item_comment`     | 删除评论           |

## 定位工作项

所有工具都需要定位到具体工作项，支持两种方式（二选一）：

- **方式 A（推荐）**：传 `url`，如 `https://project.feishu.cn/<project_key>/<work_item_type>/detail/<work_item_id>`
- **方式 B**：同时传 `project_key` + `work_item_type`（或 `work_item_type_key`）+ `work_item_id`

> 优先让用户提供详情页 URL，避免手动拼参数。

## 工具详情

### update_work_item_description

更新工作项描述字段。补充官方 MCP `update_field` 对描述字段的限制。

```
必填：description（支持 markdown）
可选：field_key（默认 "description"，仅自定义字段 key 时需要）
```

### create_work_item_comment

在工作项下添加一条纯文本评论。

```
必填：content（评论内容）
```

### list_work_item_comments

获取工作项下的所有评论，返回评论数组。

```
无额外参数，仅需定位工作项。
```

### delete_work_item_comment

删除指定评论，仅评论创建人可删除。

```
必填：comment_id（通过 list_work_item_comments 获取）
```

## 典型场景

### 更新工作项描述

1. 获取用户提供的工作项 URL。
2. 准备完整的描述文本（markdown 格式）。
3. 调用 `update_work_item_description`。

### 在工作项中添加进度说明

1. 获取工作项 URL。
2. 调用 `create_work_item_comment` 写入说明。

### 清理过期评论

1. 调用 `list_work_item_comments` 获取评论列表。
2. 筛选出需要删除的评论。
3. 对每条评论调用 `delete_work_item_comment`。

## 错误排查

| 现象             | 原因                                                    |
| ---------------- | ------------------------------------------------------- |
| 缺少参数         | 未提供 `url` 或不完整的三元组                           |
| 权限错误         | 插件未具备工作项写权限                                  |
| 字段不支持       | 描述字段 key 不是默认的 `description`，需传 `field_key` |
| Record not found | `comment_id` 不正确或评论已被删除                       |
| 仅创建人可操作   | 删除评论只限评论的原始创建人                            |
