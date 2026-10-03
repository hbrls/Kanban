# 打开 Kanban 的页面加载副作用调查

更新时间：2026-09-27

## 结论

当前打开 Kanban 页面会请求 `GET /api/kanban/boards?workspaceId=...`。这个 GET 接口并非只读：它可能清理并持久化 Task 状态、创建 ACP Session、发送新的 Task Prompt，并启动 Agent 执行。

这属于严重的 HTTP 语义和业务边界问题。页面展示 Kanban 不应该触发任务执行，也不应该自动恢复或重新创建 Session。

本次调查没有修改运行代码。

## 页面请求入口

Kanban 页面在加载或刷新时通过以下代码获取 Board：

- 文件：`src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx`
- 位置：约第 84 行
- 请求：`GET /api/kanban/boards?workspaceId=...`

路由由 Rust server 注册：

- 文件：`crates/routa-server/src/api/kanban.rs`
- 路由：`/boards` 使用 `get(list_boards).post(create_board)`

## GET 的实际调用链

```text
打开 Kanban
  -> GET /api/kanban/boards
  -> list_boards
  -> kanban.listBoards
  -> 遍历 Board
  -> revive_missing_entry_automations
  -> trigger_assigned_task_agent
  -> 创建 ACP Session
  -> 保存 Session
  -> 异步发送 Task Prompt
  -> 更新并保存 Task
```

`list_boards` 在返回 Board 之前直接调用：

- 文件：`crates/routa-server/src/api/kanban.rs`
- 位置：约第 433-434 行

```rust
for board_id in &board_ids {
    revive_missing_entry_automations(&state, &workspace_id, board_id).await?;
}
```

## `revive_missing_entry_automations` 做了什么

文件：`crates/routa-server/src/api/kanban.rs`

该函数不是查询逻辑，而是任务恢复/自动执行逻辑。对每个 Board 下的 Task，它会：

1. 检查并清理当前 lane 中已经失效的 Session。
2. 清理时可能更新 `lane_sessions`、`trigger_session_id` 和 `updated_at`，并保存 Task。
3. 判断当前列是否启用了 `entry` 或 `both` 类型的自动化。
4. 判断当前列是否没有活动 Session。
5. 调用 `trigger_assigned_task_agent(state, &mut task, None, None)`。
6. 保存自动化结果和新的 Task 状态。

关键位置：

- `crates/routa-server/src/api/kanban.rs:322-380`
- 调用 Agent：`crates/routa-server/src/api/kanban.rs:365-369`
- 保存 Task：`crates/routa-server/src/api/kanban.rs:375-376`

## 这不是 Resume，而是重新创建和执行

自动路径没有使用用户手工点击 Detail 后触发的 `resumeSessionStrict`。

`trigger_assigned_task_agent` 会：

- 生成新的 UUID 作为 Session ID；
- 调用 `acp_manager.create_session`；
- 将 ACP Session 写入持久化存储；
- 标记首个 Prompt 已发送；
- 异步调用 `acp_manager.prompt`。

关键位置：

- 创建新 Session：`crates/routa-server/src/api/tasks_automation.rs:340-364`
- 保存 Session：`crates/routa-server/src/api/tasks_automation.rs:366-375`
- 发送 Prompt：`crates/routa-server/src/api/tasks_automation.rs:451-463`

因此这里的行为是自动重新运行/重新创建 Agent Session，不是恢复旧 Session。

此外，由于调用方传入 `cwd = None`，自动路径会回退到 Rust 服务进程的当前目录：

```rust
std::env::current_dir()
```

这还可能导致重新创建的 Session 在错误目录中启动。

## 另一个 GET 副作用：确保默认 Board

`list_boards` 通过 RPC 调用 `kanban.listBoards`。RPC 实现会先确保 Workspace 存在，并调用 `ensure_default_board`：

- 文件：`crates/routa-core/src/rpc/methods/kanban/boards.rs`
- 位置：约第 50-58 行

```rust
ensure_workspace_exists(state, &params.workspace_id).await?;
state
    .kanban_store
    .ensure_default_board(&params.workspace_id)
    .await?;
```

因此在默认 Board 不存在时，即使不考虑 Agent 自动执行，这个 GET 也可能创建默认 Board。它是较小的状态副作用，但同样不符合严格只读的 GET 语义。

## 风险范围

打开页面、刷新页面，或 Kanban 事件导致页面重新获取 Board，都可能进入该链路。潜在影响包括：

- 修改 Task 状态和 Session 状态；
- 创建新的 ACP Session；
- 启动 Agent；
- 发送新的 Task Prompt；
- Agent 后续可能修改仓库文件；
- 在错误 cwd 下启动 Agent。

这不是“展示页面时顺便检查状态”，而是把任务执行行为放进了 Board 列表查询接口。

## 与正常 TaskAutomation 的边界

正常的 TaskAutomation 由 Task 创建或列迁移等明确的写操作触发，应保持不变。

用户手工恢复 Session 的 `resumeSessionStrict` 路径也应保持不变。

本次事故涉及的是打开 Kanban 时由 GET 隐式调用的 `revive_missing_entry_automations`，不能将它与正常 TaskAutomation 或手工 Resume 混为一谈。

## 当前代码覆盖情况

当前实际运行的 Kanban API 是 Rust server 实现。`src/app/api/kanban/boards/route.ts` 已经不存在，但该路径下仍残留旧测试文件；因此旧测试并不能证明当前 Rust GET 路由是只读的。

## 当前调查结论

最小的后续隔离点是：从 `list_boards` 中移除对 `revive_missing_entry_automations` 的调用，使 Board GET 恢复为查询用途；保留正常 TaskAutomation 和手工 `resumeSessionStrict`。本文件只记录调查结果，本次未实施该改动。
