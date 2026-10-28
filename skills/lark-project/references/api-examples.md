# 工具调用示例

> 下列 `name` + `arguments` 表示 MCP 调用示意。占位值必须替换为查询确认的真实值；省略无关可选参数。实际名称、参数与类型以当前连接 schema 为准，见 [mcp-guide.md](mcp-guide.md)。

目录：空间域 · 工作项元数据/查询/创建/更新 · 人员域 · 工作台 · 工时 · 视图 · 工作流 · 评论 · 关系 · 子任务。

---

## 空间域

### lark-project__search_project_info

按名称或 key 搜索：

```json
{
  "name": "lark-project__search_project_info",
  "arguments": {
    "project_key": "空间名或key",
    "page_num": 1
  }
}
```

省略 project_key 可列出当前用户可访问的空间（按最近访问排序）。

---

## 工作项域

### lark-project__list_workitem_types

```json
{
  "name": "lark-project__list_workitem_types",
  "arguments": {
    "project_key": "空间key"
  }
}
```

### lark-project__list_workitem_field_config

```json
{
  "name": "lark-project__list_workitem_field_config",
  "arguments": {
    "page_num": 1,
    "project_key": "空间key",
    "work_item_type": "story"
  }
}
```

### lark-project__list_workitem_role_config

```json
{
  "name": "lark-project__list_workitem_role_config",
  "arguments": {
    "page_num": 1,
    "project_key": "空间key",
    "work_item_type": "story"
  }
}
```

> **MQL 查询前必须先执行**：字段/枚举/树状字段用 `lark-project__list_workitem_field_config` 查 key 与 options；涉及角色并行调用 `lark-project__list_workitem_role_config` 取 `role_id` / `role_name`。字段与角色配置由「空间 + 工作项类型」双维度决定。业务线等树状字段直接传中文时必须传叶子节点名，禁拼完整路径。

### lark-project__search_by_mql

首查：

```json
{
  "name": "lark-project__search_by_mql",
  "arguments": {
    "project_key": "空间key",
    "mql": "SELECT `work_item_id`, `name`, `work_item_status` FROM `空间key`.`story` WHERE `archiving_date` IS NULL"
  }
}
```

首查返回第 1 页（最多 50 条）和 `session_id`、`list[0].count`、`list[0].group_infos[].group_id`。
翻页只传 `project_key` + `session_id` + `group_pagination_list`，不传 `mql`；`page_num` 从 2 取到 ceil(count/50)。无分组时 `group_id` 为 `"1"`：

```json
{
  "name": "lark-project__search_by_mql",
  "arguments": {
    "project_key": "空间key",
    "session_id": "首查返回的session_id",
    "group_pagination_list": [
      {
        "group_id": "1",
        "page_num": 2
      }
    ]
  }
}
```

有分组翻页时，group_id 从首查 `list[].group_infos[].group_id` 取：

```json
{
  "name": "lark-project__search_by_mql",
  "arguments": {
    "project_key": "空间key",
    "session_id": "首查返回的session_id",
    "group_pagination_list": [
      {
        "group_id": "分组ID",
        "page_num": 3
      }
    ]
  }
}
```

### lark-project__get_workitem_brief

基础查询：

```json
{
  "name": "lark-project__get_workitem_brief",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key"
  }
}
```

只取拉群方式：

```json
{
  "name": "lark-project__get_workitem_brief",
  "arguments": {
    "work_item_id": "工作项ID",
    "fields": [
      "group_type"
    ],
    "project_key": "空间key"
  }
}
```

全量字段分页时 fields 传 `["_all"]`；直接传数字 `page_size` 和字符串 `page_token`。

```json
{
  "name": "lark-project__get_workitem_brief",
  "arguments": {
    "work_item_id": "工作项ID",
    "fields": [
      "_all"
    ],
    "project_key": "空间key",
    "page_size": 100
  }
}
```

```json
{
  "name": "lark-project__get_workitem_brief",
  "arguments": {
    "work_item_id": "工作项ID",
    "fields": [
      "_all"
    ],
    "project_key": "空间key",
    "page_size": 100,
    "page_token": "<next_page_token>"
  }
}
```

### lark-project__create_workitem

基础创建（仅标量）：

```json
{
  "name": "lark-project__create_workitem",
  "arguments": {
    "work_item_type": "story",
    "fields": [
      {
        "field_key": "template",
        "field_value": "模板ID"
      },
      {
        "field_key": "name",
        "field_value": "需求标题"
      }
    ],
    "project_key": "空间key"
  }
}
```

创建并指定报告人/经办人（role_owners 是 stringified JSON）：

```json
{
  "name": "lark-project__create_workitem",
  "arguments": {
    "work_item_type": "issue",
    "fields": [
      {
        "field_key": "name",
        "field_value": "示例缺陷"
      },
      {
        "field_key": "template",
        "field_value": "模板ID"
      },
      {
        "field_key": "role_owners",
        "field_value": "[{\"role\":\"reporter\",\"owners\":[\"userkey1\"]},{\"role\":\"operator\",\"owners\":[\"userkey2\"]}]"
      }
    ],
    "project_key": "空间key"
  }
}
```

> **`role_owners` 中 `role` 字段填 `role_id`**（`lark-project__list_workitem_role_config` 返回的英文 key，如 `operator` / `reporter` / `role_xxxxxx`），不是 `role_name`。系统默认 `role_id`：报告人 `reporter`、经办人 `operator`。自定义角色的 `role_id` 形式多样，**必须先调 `lark-project__list_workitem_role_config` 确认**。创建时可在 `fields` 传 `role_owners`；更新已有工作项角色**必须**用 `lark-project__update_field` 的 `role_operate`。

### lark-project__update_field

更新普通字段：

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "priority",
        "field_value": "option_id"
      }
    ]
  }
}
```

更新 multi-user（复合值 stringified）：

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "current_status_operator",
        "field_value": "[\"userkey1\",\"userkey2\"]"
      }
    ]
  }
}
```

普通复合字段分别使用 `add` / `update` / `delete` action：

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "复合字段key",
        "field_value": "{\"action\":\"add\",\"fields\":[[{\"field_key\":\"子字段key\",\"field_value\":\"示例值\"}]]}"
      }
    ]
  }
}
```

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "复合字段key",
        "field_value": "{\"action\":\"update\",\"group_uuid\":\"读回的组标识\",\"fields\":[[{\"field_key\":\"子字段key\",\"field_value\":\"新值\"}]]}"
      }
    ]
  }
}
```

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "复合字段key",
        "field_value": "{\"action\":\"delete\",\"group_uuid\":\"读回的组标识\"}"
      }
    ]
  }
}
```

多人复合字段必须整体覆盖且不可用于新增人员：

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "多人复合字段key",
        "field_value": "{\"userkey1\":[{\"field_key\":\"子字段key\",\"field_value\":\"示例值\"}],\"userkey2\":[]}"
      }
    ]
  }
}
```

更新拉群方式（group_type 逻辑字段）：

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "group_type",
        "field_value": "{\"type\":\"auto\"}"
      }
    ]
  }
}
```

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "group_type",
        "field_value": "{\"type\":\"bind\",\"group_id\":\"oc_xxx\"}"
      }
    ]
  }
}
```

```json
{
  "name": "lark-project__update_field",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "fields": [
      {
        "field_key": "group_type",
        "field_value": "{\"type\":\"disabled\"}"
      }
    ]
  }
}
```

`auto` / `disabled` 不得携带 group_id。

> **多人复合字段**：目标 userkey 不在读回 map 中时停止自动更新，向用户说明需先通过页面配置人员范围；接口空成功后必须回读确认。

---

## 人员域

### lark-project__search_user_info

默认仅在职：

```json
{
  "name": "lark-project__search_user_info",
  "arguments": {
    "user_keys": [
      "张三",
      "李四"
    ],
    "project_key": "<project_key>",
    "need_all_status": false
  }
}
```

包含离职/停用：

```json
{
  "name": "lark-project__search_user_info",
  "arguments": {
    "user_keys": [
      "张三"
    ],
    "project_key": "<project_key>",
    "need_all_status": true
  }
}
```

### 当前用户身份

```json
{
  "name": "lark-project__search_user_info",
  "arguments": {"user_keys": ["current_login_user()"]}
}
```

提取真实返回的 `user_key` 再用于写入；查询标记本身不是 userkey。

---

## 工作台域

### lark-project__list_todo

```json
{
  "name": "lark-project__list_todo",
  "arguments": {
    "action": "todo",
    "page_num": 1
  }
}
```

`action`：`todo` / `done` / `overdue` / `this_week`。

---

## 工时域

### lark-project__list_schedule

```json
{
  "name": "lark-project__list_schedule",
  "arguments": {
    "start_time": "2025-03-01",
    "end_time": "2025-03-31",
    "project_key": "空间key",
    "user_keys": [
      "张三",
      "李四"
    ]
  }
}
```

### lark-project__get_workitem_man_hour_records

```json
{
  "name": "lark-project__get_workitem_man_hour_records",
  "arguments": {
    "project_key": "空间key",
    "work_item_type": "story",
    "work_item_id": "工作项ID",
    "page_num": 1
  }
}
```

---

## 视图域

### lark-project__get_view_detail

```json
{
  "name": "lark-project__get_view_detail",
  "arguments": {
    "view_id": "视图ID",
    "project_key": "空间key"
  }
}
```

---

## 工作流域

### lark-project__get_node_detail

```json
{
  "name": "lark-project__get_node_detail",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "node_id_list": [
      "节点ID或_all"
    ]
  }
}
```

### lark-project__transition_node（节点流）

```json
{
  "name": "lark-project__transition_node",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "node_id": "节点ID",
    "action": "confirm"
  }
}
```

### lark-project__transition_state（状态流）

```json
{
  "name": "lark-project__transition_state",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key",
    "transition_id": "流转ID"
  }
}
```

### lark-project__get_transitable_states

```json
{
  "name": "lark-project__get_transitable_states",
  "arguments": {
    "work_item_id": "工作项ID",
    "work_item_type": "story",
    "user_key": "userkey",
    "project_key": "空间key"
  }
}
```

### lark-project__get_transition_required

```json
{
  "name": "lark-project__get_transition_required",
  "arguments": {
    "work_item_id": "工作项ID",
    "state_key": "目标状态key",
    "project_key": "空间key",
    "mode": "unfinished"
  }
}
```

---

## 评论域

### lark-project__add_comment

```json
{
  "name": "lark-project__add_comment",
  "arguments": {
    "work_item_id": "工作项ID",
    "content": "评论内容",
    "project_key": "<project_key>"
  }
}
```

### lark-project__list_workitem_comments

```json
{
  "name": "lark-project__list_workitem_comments",
  "arguments": {
    "work_item_id": "工作项ID",
    "project_key": "空间key"
  }
}
```

---

## 关系域

### lark-project__list_workitem_relations

```json
{
  "name": "lark-project__list_workitem_relations",
  "arguments": {
    "project_key": "空间key"
  }
}
```

### lark-project__list_related_workitem

```json
{
  "name": "lark-project__list_related_workitem",
  "arguments": {
    "project_key": "空间key",
    "work_item_id": "工作项ID"
  }
}
```

---

## 子任务域

### lark-project__update_node_subtask

```json
{
  "name": "lark-project__update_node_subtask",
  "arguments": {
    "node_id": "节点ID",
    "project_key": "<project_key>",
    "work_item_id": "工作项ID",
    "action": "create"
  }
}
```
