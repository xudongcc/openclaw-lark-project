# 工作流与流转操作

## lark_project_workflow_get — 获取工作流详情

获取工作项的工作流信息，自动区分节点流和状态流。**在执行任何流转操作前必须先调用此工具。**

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123"
}
```

### 返回结构对比

| 工作流类型 | 节点列表字段 | 节点 status 含义 | connections 字段 |
|-----------|-------------|-----------------|-----------------|
| **节点流** | `workflow_nodes` | 1=未到达, 2=已到达, 3=已通过 | 节点间关系 |
| **状态流** | `state_flow_nodes` | 2=当前状态 | 含 `transition_id`（用于 `lark_project_state_change`） |

### 节点流示例返回

```json
{
  "workflow_nodes": [
    { "id": "backlog", "name": "待处理", "status": 3 },
    { "id": "doing", "name": "进行中", "status": 2 },  // ← 可操作
    { "id": "done", "name": "已完成", "status": 1 }
  ]
}
```

### 状态流示例返回

```json
{
  "state_flow_nodes": [
    { "state_key": "open", "name": "开启", "status": 1 },
    { "state_key": "in_progress", "name": "处理中", "status": 2 }  // ← 当前状态
  ],
  "connections": [
    {
      "source_state_key": "in_progress",
      "target_state_key": "resolved",
      "transition_id": "transition_abc123"  // ← 用于状态流转
    }
  ]
}
```

---

## lark_project_node_confirm — 完成节点（节点流）

将状态为「已到达」（status=2）的节点标记为完成。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "node_id": "doing",
  "node_owners": ["7136000000000000676"]
}
```

**前置条件**：
- 目标节点 `status` 必须为 `2`（已到达）
- 建议传入 `node_owners`（节点负责人）

**可选参数**：
- `node_schedule` — 排期
- `fields` — 表单字段
- `role_assignee` — 角色负责人

> ⚠️ **注意**：流转前需确保必填信息已填写，否则会报错 `20038 Required Field Is Not Set`。

---

## lark_project_node_rollback — 回滚节点（节点流）

将已完成的节点回滚到「已到达」状态。

```json
{
  "url": "https://project.feishu.cn/openclaw/story/detail/123",
  "node_id": "doing",
  "rollback_reason": "需求变更，重新评审"
}
```

**前置条件**：
- 目标节点 `status` 必须为 `3`（已通过）
- `rollback_reason` 必填

> ⚠️ **注意**：流转前需确保必填信息已填写，否则会报错 `20038 Required Field Is Not Set`。

---

## lark_project_state_change — 状态流转（状态流）

执行状态流工作项的状态流转。

```json
{
  "url": "https://project.feishu.cn/openclaw/issue/detail/456",
  "transition_id": "transition_xxx"
}
```

### 获取 transition_id 的步骤

1. 调用 `lark_project_workflow_get`
2. 从 `state_flow_nodes` 找到 `status=2` 的当前状态
3. 从 `connections` 找 `source_state_key` 匹配当前状态的 `transition_id`

**可选参数**：
- `fields` — 表单字段
- `role_owners` — 角色人员

---

## 标准流程

### 节点流转（节点流）

```
lark_project_workflow_get
    ↓
从 workflow_nodes 找 status=2 的节点
    ↓
lark_project_node_confirm（完成）或 lark_project_node_rollback（回滚）
    ↓
lark_project_workflow_get 回读验证
```

### 状态流转（状态流）

```
lark_project_workflow_get
    ↓
从 state_flow_nodes 找 status=2 的当前状态
从 connections 找 source_state_key 匹配的 transition_id
    ↓
lark_project_state_change（传入 transition_id）
    ↓
lark_project_workflow_get 回读验证
```

### 节点流转示例

**场景**：完成「评审」节点

1. **查询工作流**：
   ```json
   { "url": "https://project.feishu.cn/openclaw/story/detail/123" }
   ```
   返回中 `workflow_nodes` 显示评审节点 status=2（已到达）

2. **完成节点**：
   ```json
   {
     "url": "https://project.feishu.cn/openclaw/story/detail/123",
     "node_id": "review",
     "node_owners": ["7136000000000000676"]
   }
   ```

3. **验证**：再次调用 `lark_project_workflow_get`，确认评审节点 status=3（已通过）

### 状态流转示例

**场景**：将缺陷从「处理中」流转到「已解决」

1. **查询工作流**：
   ```json
   { "url": "https://project.feishu.cn/openclaw/issue/detail/456" }
   ```
   返回中 `state_flow_nodes` 显示当前状态为「处理中」(status=2)，`connections` 中包含到「已解决」的 transition_id

2. **状态流转**：
   ```json
   {
     "url": "https://project.feishu.cn/openclaw/issue/detail/456",
     "transition_id": "transition_resolve_123"
   }
   ```

3. **验证**：再次调用 `lark_project_workflow_get`，确认当前状态已变为「已解决」
