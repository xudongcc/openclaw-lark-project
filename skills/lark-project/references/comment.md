# 评论管理

## lark_project_comment_create — 添加评论

在工作项下添加一条纯文本评论。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "content": "评论内容（纯文本，不支持 markdown）"
}
```

**返回**：`data` 字段为新评论 ID。

---

## lark_project_comment_list — 查询评论

获取工作项的所有评论列表。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123"
}
```

**返回**：`data` 字段为评论数组，每条包含：
- `id` — 评论 ID
- `author` — 含 `user_key` 和 `name`
- `content` — 评论内容
- `created_at` — 创建时间
- `is_mine` — 是否当前用户创建
- `can_update`, `can_delete` — 操作权限
- `mentions` — 提及的用户（可选）

---

## lark_project_comment_update — 更新评论

更新指定评论。仅评论的原始创建人可操作。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "comment_id": "7xxx",
  "content": "新的评论内容"
}
```

---

## lark_project_comment_delete — 删除评论

仅评论创建人可删除。`comment_id` 通过 `lark_project_comment_list` 获取。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "comment_id": "7xxx"
}
```

---

## 标准流程

### 添加评论

```
直接调用 lark_project_comment_create
```

### 查看评论

```
lark_project_comment_list
```

### 修改自己的评论

```
lark_project_comment_list 确认 can_update=true
    ↓
lark_project_comment_update
```

### 删除自己的评论

```
lark_project_comment_list 确认 can_delete=true
    ↓
lark_project_comment_delete
```
