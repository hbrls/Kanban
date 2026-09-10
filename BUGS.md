# 已知问题

本文记录已经通过代码调研确认、但尚未修复的问题。开发规范和交付边界见 [DEVELOPMENT.md](DEVELOPMENT.md)；本文件不替代开发规范。

## BUG-001：TypeScript 后台任务没有绑定任务仓库

状态：未修复

### 现象

Next.js Node runtime 启动时会自动启动 `BackgroundTaskWorker`。任务创建数据只保存 `workspaceId`，没有保存任务对应的 `repositoryPath`、`repoPath`、`codebaseId` 或 `worktreeId`：

- `src/core/models/background-task.ts:45`
- `src/core/models/background-task.ts:107`
- `src/app/workspace/[workspaceId]/bg-tasks-tab.tsx:64`

创建 ACP session 时，Worker 无条件使用 Node 进程的当前目录：

- `src/core/background-worker/index.ts:261`
- `src/core/background-worker/index.ts:273`

```ts
params: {
  workspaceId: task.workspaceId,
  cwd: process.cwd(),
}
```

### 复现条件

1. 在一个 workspace 中登记仓库 `/tmp/project-a`。
2. 从 Routa 仓库目录启动 Next.js Server。
3. 在该 workspace 创建后台 Agent 任务。
4. 任务进入 `BackgroundTaskWorker` 调度流程。

传给 `session/new` 的 `cwd` 会是 Routa Server 的启动目录，而不是 `/tmp/project-a`。如果 workspace 管理多个 codebase，所有后台任务都会落到同一个进程当前目录，无法区分任务目标仓库。

### 根因

后台任务模型、创建 API、持久化层和调度器之间没有贯通任务仓库路径；调度器用 `process.cwd()` 代替了任务上下文。

### 修复方向

- 在任务创建时绑定明确的 `repositoryPath`，或绑定可解析到仓库的 `codebaseId` / `worktreeId`。
- 将该绑定写入任务持久化模型，并在重试、恢复和工作流任务中保留。
- `BackgroundTaskWorker` 只能使用任务解析出的路径创建 ACP session；缺少路径时应拒绝执行并标记失败。
- 增加测试，断言传给 ACP `session/new` 的 `cwd` 等于任务绑定的仓库路径。

## BUG-002：`LocalWorker` 使用 `process.cwd()` 启动 Agent

状态：未修复

### 现象

`LocalWorker.execute()` 直接把进程当前目录作为所有 Agent session 的工作目录：

- `src/core/worker/local-worker.ts:81`
- `src/core/worker/local-worker.ts:96`

```ts
const cwd = process.cwd();
```

之后的 `createSession`、`createClaudeSession` 和 `createWorkspaceAgentSession` 都使用这个值。

### 影响

当前仓库中没有找到 `new LocalWorker()` 的生产调用方，因此这是一个尚未接入完成的 Worker 实现缺陷；一旦 Dispatcher 接入它，任务仍会被启动到 Routa 进程当前目录，而不是任务指定的仓库。

### 修复方向

`BackgroundTask` 或 Worker 执行输入必须携带已验证的仓库路径，`LocalWorker.execute()` 应使用该路径，并在路径缺失、不可读或不是目录时拒绝启动 Agent。不能以 `process.cwd()` 作为业务 fallback。

## BUG-003：Rust Kanban 自动化在无法解析仓库时 fallback 到进程当前目录

状态：未修复

### 现象

Rust Kanban 自动化通常会按 worktree、task codebase、默认 codebase 和 workspace codebase 顺序解析 Agent 工作目录：

- `crates/routa-core/src/rpc/methods/kanban/automation.rs:904`

但所有解析失败后仍会使用 `std::env::current_dir()`：

- `crates/routa-core/src/rpc/methods/kanban/automation.rs:954`

### 影响

如果任务没有 `worktree_id`、没有 `codebase_ids`，且 workspace 没有 codebase，Agent 会被静默启动到 Rust Server 的当前目录。这样会把“缺少任务仓库绑定”伪装成一次有效执行，并可能修改错误项目。

### 修复方向

仓库路径解析失败时应返回明确错误，不应 fallback 到 `current_dir()`。应要求任务显式关联 codebase 或 worktree，并增加无仓库绑定时的失败测试。
