# Kanban 本地 ACP Runtime 调研

本文只讨论当前产品约束下的本地 Tauri App 运行面：

```text
Tauri App
  ├── WebView 前端
  └── Rust/Axum 后端
        └── 本机 Agent 子进程
```

以下内容明确排除：

- Remote Agent / A2A transport。
- Docker provider、`SandboxManager`、`DockerProcessManager`。
- 前端直接启动 shell、Terminal 或 PTY。
- 将 WebView 与 Rust 后端视为两个可独立部署、独立重启的产品。

## 1. 运行拓扑

Kanban ACP 的本地链路是：

```text
Kanban WebView
  -- HTTP JSON-RPC / SSE -->
Rust `/api/acp`
  -> `AppState`
  -> `AcpManager`
  -> Claude/Codex/OpenCode 等本机 CLI 子进程
  -- line-delimited JSON-RPC over stdin/stdout -->
Agent
```

前端不直接调用 Agent CLI，也不直接创建 shell 或 PTY。前端与 Rust 之间当前使用 HTTP JSON-RPC 和 SSE；Rust 与 ACP 子进程之间使用逐行 JSON-RPC（JSONL 风格的 stdin/stdout 通信）。

Claude 是特殊 provider：Rust 启动 `ClaudeCodeProcess`，使用 Claude CLI 的 `stream-json` 输入/输出；本质上仍然是由 Rust 创建和管理的本机子进程。

相关代码：

- `crates/routa-core/src/acp/process.rs`
- `crates/routa-core/src/acp/claude_code_process.rs`
- `crates/routa-server/src/api/acp_routes.rs`
- `src/client/acp-client.ts`

## 2. HTTP Stateless 与 ACP Runtime Stateful

普通 CRUD API 基本是无状态的：请求读取或修改 SQLite，完成后返回响应。

ACP 执行不是单个短 HTTP 请求，而是一个持续数分钟的本地执行过程，因此 Rust 必须维护进程内运行时状态。`AppState` 是共享的 `Arc<AppStateInner>`，其中包含 `AcpManager` 和各类 Store：

```text
SQLite
  = 持久化业务事实

AcpManager
  = 当前 Tauri 实例中的 ACP 执行控制平面

Agent 子进程
  = 实际执行平面
```

SQLite 保存 Session 元数据、provider session ID、history、Task 关联等，但不保存：

- 子进程句柄。
- stdin/stdout 管道。
- pending JSON-RPC 回调。
- Tokio task 句柄。
- broadcast channel。

因此：

> SQLite 中存在 Session row，不代表当前仍有可控制的 Agent 进程。

## 3. `AcpManager`

`AcpManager` 是 Kanban ACP Session 的核心内存对象，维护：

```text
ourSessionId
  -> AcpSessionRecord
  -> ManagedProcess
  -> AcpProcess / ClaudeCodeProcess
  -> broadcast notification channel
  -> in-memory history
```

其主要职责：

- 创建 Agent 子进程。
- 保存 Routa Session 与 Agent Session ID 的映射。
- 向 Agent stdin 发送 ACP 请求。
- 从 Agent stdout/stderr 接收响应和通知。
- 将通知广播给 SSE 订阅者。
- 保存运行时 history，并在适当路径镜像到 SQLite。
- 取消当前 prompt。
- kill 单个 Session 的 Agent 进程。

相关代码：

- `crates/routa-core/src/acp/mod.rs:162`
- `crates/routa-core/src/acp/process.rs:39`
- `crates/routa-core/src/acp/mod.rs:1015`

## 4. Kanban 创建 Session

Kanban 进入自动化列时，Rust 会：

1. 创建新的 Routa Session ID。
2. 使用 `AcpManager` 启动 Agent 子进程。
3. 把 Session 元数据写入 SQLite。
4. 设置 `first_prompt_sent`。
5. 在后台 Tokio task 中发送 Kanban prompt。
6. 将 Session ID 写入 Task 的 `triggerSessionId`、`sessionIds` 和 `laneSessions`。

相关代码：

- `crates/routa-server/src/api/tasks_automation.rs:241`
- `crates/routa-server/src/api/tasks_automation.rs:271`
- `crates/routa-server/src/api/tasks_automation.rs:370`
- `crates/routa-server/src/api/tasks_automation.rs:440`

### 4.1 Session ID 持久化的两步契约

创建 Agent Session 后，所有创建方必须严格按以下顺序持久化：

```text
1. AcpSessionStore::create(...)
2. AcpSessionStore::set_provider_session_id(session_id, agent_session_id)
```

`create` 写入 Routa Session 的 SQLite 主键和元数据；`set_provider_session_id` 再写入 Provider 返回的真实 Agent Session ID。SQLite 的 `acp_sessions.id` 与 `provider_session_id` 是两个不同字段，不能只完成第一步。

本次审计发现以下生产路径曾经只执行第一步：

- `crates/routa-server/src/api/tasks_automation.rs` 的 Kanban 自动化触发路径；已修复为在 insert 成功后立即执行 update。
- `crates/routa-server/src/api/acp_routes.rs` 的 `session/prompt` 内存 Session 缺失时的自动创建路径；当前仍未修复。
- `crates/routa-core/src/rpc/methods/kanban/automation.rs` 的 Kanban RPC 自动化触发路径；当前仍未修复。

普通 `session/new`、`session/load` 重建路径以及 Canvas Session 已执行两步持久化。历史上已经写入但 `provider_session_id` 为 `NULL` 的记录不在本次修复范围内。

## 5. 中断场景

### 5.1 WebView/SSE 连接短暂断开

这不是 Agent 执行中断。前端 `BrowserAcpClient` 会：

- 自动重连 SSE。
- 携带 `lastEventId`。
- 后端从持久化 history 回放遗漏事件。

相关代码：

- `src/client/acp-client.ts:684`
- `src/client/acp-client.ts:740`
- `crates/routa-server/src/api/acp_routes.rs:1855`

### 5.2 用户取消当前 prompt

`session/cancel` 会调用 `AcpManager.cancel()`，通常只取消当前 prompt，不等于删除 Session，也不必然 kill Agent 子进程。

相关代码：

- `crates/routa-server/src/api/acp_routes.rs:1217`
- `crates/routa-core/src/acp/mod.rs:1028`

### 5.3 用户 Disconnect

`POST /api/sessions/{sessionId}/disconnect` 会保存当前 history，kill 单个 Agent 子进程，并保留数据库 Session row。它不是全局 App shutdown。

相关代码：

- `crates/routa-server/src/api/sessions.rs:400`
- `crates/routa-server/src/api/sessions.rs:416`
- `crates/routa-server/src/api/sessions.rs:422`

### 5.4 Agent 子进程异常退出或 Provider 报错

Rust `AcpProcess` 的 stdout reader 结束后会设置 `alive = false`；pending request 会失败。若没有明确的 `acp_status:error` 或 error history，Task 可能仍保留 `triggerSessionId`，`laneSessions.status` 也可能残留为 `running`。

相关代码：

- `crates/routa-core/src/acp/process.rs:543`
- `crates/routa-core/src/acp/process.rs:765`

### 5.5 Tauri App 重启

本产品将 WebView 和 Rust 后端视为同一个 Tauri App 生命周期：一起启动、一起退出、一起重启。

重启时：

```text
旧 App
  -> AppState 销毁
  -> AcpManager 内存状态销毁
  -> 旧 Agent 按产品假设随 App 结束

新 App
  -> 新建 AppState
  -> 新建 AcpManager
  -> 从 SQLite 读取 Session/Task/history
```

不再依赖旧 Agent 进程，也不尝试重新取得旧 stdin/stdout 控制链路。重启后只能基于持久化数据做恢复判断。

## 6. Session 恢复

### 6.1 手动 Resume

Kanban Task Detail 在 ACP 错误时可以调用 `resumeSession`：

1. 尝试 `session/load`。
2. 如果当前实例已有活进程，返回 `resumeMode: attached`。
3. 如果 Provider 支持，尝试 native resume，返回 `resumeMode: native`。
4. native resume 失败时，创建新 Session，使用旧 transcript 作为恢复上下文，返回 `resumeMode: recreated`。

相关代码：

- `src/app/workspace/[workspaceId]/kanban/kanban-tab-panels.tsx:682`
- `crates/routa-server/src/api/acp_routes.rs:1241`

需要注意：Kanban 的 fallback recovery 更接近“基于旧 transcript 创建新的执行 Session”，不能自动等同于旧 lane execution 的原地恢复。

### 6.1.1 严格 Resume 的重复请求风险（暂不处理）

当前严格恢复接口 `/api/acp/resume` 以“旧 Agent 已不可用”为前提，直接通过
`AcpManager::load_session*` 启动新的 Agent 进程。它当前不检查同一个 `sessionId`
是否已经由本实例持有活跃进程。

如果同一个 Session 在旧进程仍存活时被重复恢复，`register_managed_session()` 会用新的
`ManagedProcess` 覆盖内存 Map 中的旧条目；旧进程没有经过显式 `kill()`，后续也不再由
`AcpManager` 管理。这可能导致重复 Agent、孤儿进程，以及通知/取消请求只作用于新进程。

这是服务端生命周期管理上的已知风险。当前产品流程按单客户端、单次恢复处理，暂不把
该竞态纳入本需求验收，也暂不修改恢复实现。后续如果出现多窗口、重试或并发恢复需求，
应在服务端增加按 Session 串行化/幂等保护：已有活跃进程时返回 attached，或在替换前
显式终止旧进程。

相关代码：

- `crates/routa-server/src/api/acp_routes.rs` 的 `/api/acp/resume`
- `crates/routa-core/src/acp/mod.rs` 的 `register_managed_session()`

### 6.2 Run/Rerun/Recover Live Run

Kanban 中的 `Run`、`Rerun`、`Recover Live Run` 最终都是重新触发一次 Agent Session。它们不是统一的旧 Session native resume 操作。

当前 `Rerun` 混合了多种语义：明确失败、Session 已停止、历史记录存在、运行状态未知、用户想启动新尝试等。相关状态模型仍未统一。

## 7. Kanban 重启后的自动恢复

Rust 实现了 `revive_missing_entry_automations()`，但它不是 App 启动时恢复，也不是独立后台轮询。当前调用路径是：

```text
GET /api/kanban/boards
  -> revive_missing_entry_automations()
```

也就是说，它是打开/刷新 Kanban 时触发的 lazy recovery。

相关代码：

- `crates/routa-server/src/api/kanban.rs:322`
- `crates/routa-server/src/api/kanban.rs:398`
- `crates/routa-server/src/api/kanban.rs:433`

当前 stale 判断存在重要限制：如果 `AcpManager` 中没有 Session，但 SQLite 中有 Session 且 history 没有明确 error，系统可能继续把它判断为 active。这不能证明 Agent 在重启后仍然运行，也不能完成可靠的 `session/load` 恢复。

## 8. ACP 权限请求

标准 ACP Agent 可以通过 JSON-RPC 向 Rust 发送：

```text
session/request_permission
```

Rust stdout reader 识别 Agent -> Client request，调用 `handle_agent_request()`，选择 Agent 提供的 `approved` / `allow_once` 等选项，并把带原 request ID 的 response 写回 Agent stdin。

默认 scope 是 `turn`，优先选择一次性允许；没有可用 allow option 时通常返回 cancelled，但当前 fallback 对异常 options 输入比较宽松。

相关代码：

- `crates/routa-core/src/acp/process.rs:252`
- `crates/routa-core/src/acp/process.rs:780`
- `crates/routa-core/src/acp/process.rs:886`

Claude 另有独立的默认权限配置：`ClaudeCodeProcess` 默认使用 `bypassPermissions`，启动 CLI 时追加 `--dangerously-skip-permissions`。

相关代码：

- `crates/routa-core/src/acp/claude_code_process.rs:198`
- `crates/routa-core/src/acp/claude_code_process.rs:216`

## 9. `TerminalManager` 与 `PtyManager`

### 9.1 `TerminalManager`

`TerminalManager` 是 ACP Runtime 的内部终端子系统，不是前端直接打开的终端。Agent 通过 ACP 请求：

```text
terminal/create
terminal/output
terminal/wait_for_exit
terminal/kill
terminal/release
```

Rust 代为创建和管理 Agent 请求的 shell。抽象上可以把它归入 ACP Runtime，但代码实现上它是独立的全局单例，不是 `AcpManager` 的字段。

相关代码：

- `crates/routa-core/src/acp/terminal_manager.rs:23`
- `crates/routa-core/src/acp/process.rs:814`

因此：

```text
抽象上：AcpManager + TerminalManager = ACP Runtime
实现上：两者不是严格的父子生命周期
```

讨论 Kanban Session 时可以用 `AcpManager` 作为主抽象；讨论退出清理时仍需确认 Agent 关联的 TerminalManager 资源。

### 9.2 `PtyManager`

`PtyManager` 是 Tauri 预留的用户交互式终端能力：前端如果调用 `pty_create`，Rust 会创建 PTY shell，并通过 `pty_write/read/resize/kill` 操作它。

产品约束已经明确：前端不得直接唤起 Terminal 或 PTY。当前源码虽保留 `PtyTerminal` 组件和 Tauri commands，但没有发现它被 Kanban 或 Session 页面接入。因此它不属于 Kanban ACP Session 模型，应从本次恢复和关闭分析中排除。

相关代码：

- `apps/desktop/src-tauri/src/pty.rs:25`
- `src/client/components/terminal/pty-terminal.tsx:3`

## 10. Tokio Runtime

Tokio Runtime 不是业务状态管理器，也不只是定时任务调度器。它是 Rust 后端异步执行基础设施，负责：

- Axum HTTP 和 SSE。
- Agent 子进程 stdin/stdout 异步 I/O。
- `tokio::spawn` 后台任务。
- channel、mutex、oneshot 等异步同步原语。
- timeout、sleep、interval 等定时能力。

Kanban prompt、ACP stdout reader、SSE stream、heartbeat、各种 cleanup/watchdog 都运行在 Tokio Runtime 上。

## 11. 当前 graceful shutdown 结论

当前存在单 Session 的 disconnect/kill，但没有统一的 Tauri App 级 graceful shutdown coordinator。

已确认：

- `AcpManager` 有 `kill_session(session_id)`。
- 正常 prompt 完成路径会保存 history。
- 单 Session disconnect 会保存 history 后 kill。

未发现：

- 全量 `kill_all_sessions()`。
- 全量 history flush。
- Tauri `ExitRequested` / `CloseRequested` 级别的统一退出拦截。
- 退出前暂停新的 Kanban dispatch。
- 退出前统一标记 running lane session。
- 退出前统一清理 Agent 关联的 TerminalManager 资源。

Tauri 菜单 Quit 当前直接调用 `std::process::exit(0)`；托盘 Quit 使用 `app.exit(0)`。因此当前关闭更接近立即终止，而不是完整的 graceful shutdown。

相关代码：

- `apps/desktop/src-tauri/src/lib.rs:1036`
- `apps/desktop/src-tauri/src/tray.rs:296`

## 12. 推荐的目标关闭顺序

如果后续实现 App 级 graceful shutdown，建议顺序是：

```text
Tauri 收到退出请求
  -> 暂停新的 Kanban dispatch
  -> 找出所有 running ACP lane sessions
  -> flush 当前 history
  -> 标记 interrupted_by_app_shutdown
  -> 清理 triggerSessionId / 更新 laneSessions
  -> cancel 当前 prompt（有界等待）
  -> 清理 Agent 关联的 TerminalManager 资源
  -> kill ACP processes
  -> 停止后台 Tokio tasks / HTTP server
  -> app.exit(0)
```

退出状态最好明确表示“被 App 关闭打断”，不要伪装成 `completed`。如果暂时不能扩展状态枚举，至少需要持久化：

```text
laneSessions.status = timed_out 或 interrupted 等价状态
lastSyncError = Tauri app closed while session was running
triggerSessionId = null
```

## 13. 最终范围结论

当前 Kanban 本地 ACP 调研只需要关注：

```text
Kanban WebView
  -> Rust ACP API
  -> AcpManager
  -> 本机 Agent 子进程
  -> Agent 关联的 TerminalManager 资源
```

不纳入：

```text
Remote/A2A
Docker/Sandbox
PtyManager
前端直接 Terminal/PTY
```

核心架构判断是：

> HTTP API 的 CRUD 部分可以近似 Stateless；ACP 执行部分必须依赖当前 Tauri 实例中的 Stateful Runtime。重启后保留 SQLite 持久化事实，但不保留旧 ACP 进程控制状态，因此恢复必须基于持久化数据重新创建或恢复 Session。

## 14. Kanban Card 封面的 Session 口径

本节只讨论 Kanban Card 封面，不讨论详情弹窗的 `activeSessionId`。

### 14.1 当前实际绑定规则

Card 封面当前只使用 `task.triggerSessionId`：

```tsx
linkedSession={
  task.triggerSessionId
    ? sessionMap.get(task.triggerSessionId)
    : undefined
}
```

相关代码：

- `src/app/workspace/[workspaceId]/kanban/kanban-tab-panels.tsx:443`
- `src/app/workspace/[workspaceId]/kanban/kanban-card.tsx:140`

因此封面实际数据流是：

```text
task.triggerSessionId
  -> sessionMap.get(sessionId)
  -> linkedSession
  -> linkedSession.acpStatus
```

封面不会使用：

- `task.sessionIds`；
- `task.laneSessions`；
- `task.columnId` 来筛选当前 Lane；
- 当前 Lane 最近的一条 Session 作为 fallback。

所以当 `triggerSessionId` 为 `null` 时，即使 `laneSessions` 中存在当前 Lane 的 Session，Card 封面也不会显示该 Session。

### 14.2 `sessionIds` 的范围

`task.sessionIds` 是 Task 级扁平历史数组，表示所有曾经关联过该 Task 的 Session ID。它不携带 Lane、Step、状态或当前运行语义。

本调研不再使用 `sessionIds` 推断 Card 封面的当前 Session。它最多用于历史兼容、运行次数统计或旧数据迁移。

Lane 级关联应使用：

```text
task.columnId
  + task.laneSessions[].columnId
  + task.laneSessions[].sessionId
```

### 14.3 `sessionMap` 是什么

`sessionMap` 是 Kanban WebView 内存中的查询索引：

```text
Map<sessionId, SessionInfo>
```

它由两部分合并得到：

```text
sessions             = 当前 Session API 列表
backfilledSessions   = 针对缺失 ID 单独拉取的 SessionInfo
```

相关代码：

- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx:270`

它可以视为前端内存缓存，但不是持久化缓存、不是 `AcpManager`、不是进程句柄，也不负责决定 Task 应该绑定哪个 Session。Tauri/WebView 重启后该 Map 会重新构建。

### 14.4 谁触发 Session backfill

当前 backfill 由 `KanbanTab` 的 `useEffect` 触发，而不是由 Card 封面组件触发。

触发条件是：

```text
activeTask 存在
且 preferredActiveTaskSessionId 或 activeSessionId 存在
且 sessionMap 中不存在该 ID
```

随后调用：

```text
GET /api/sessions/{sessionId}
```

相关代码：

- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx:623`
- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx:636`

因此，当前 backfill 主要覆盖“已经打开详情的 Task”。Card 封面本身没有独立的缺失 Session backfill 逻辑。

### 14.5 当前封面的实际缺口

如果出现：

```text
task.triggerSessionId 有值
但该 Session 不在 sessionMap
且详情没有打开
```

Card 封面会拿不到 `linkedSession`。这不是 `sessionMap` 的查询错误，而是封面没有触发 targeted backfill。

在 Lane 语义下问题更明显：

```text
task.triggerSessionId == null
task.laneSessions 中存在当前 Lane Session
```

此时封面无论是否完成 backfill，都不会显示该 Lane Session，因为封面绑定逻辑根本没有读取 `laneSessions`。

因此当前 Card 封面不是：

```text
当前 Lane 最近 Session
```

也不是：

```text
laneSessions 中 status == running 的 Session
```

而是：

```text
triggerSessionId 指向的 Session
```

### 14.6 推荐的 Lane 封面口径

如果后续按 Lane 语义修正 Card 封面，建议使用：

```text
1. 用 task.columnId 定位当前 Lane。
2. 在 task.laneSessions 中找到该 Lane 最近的一条记录。
3. 用该记录的 sessionId 查 sessionMap。
4. sessionMap 缺失时，由 Card/Kanban 层触发 GET /api/sessions/{sessionId}。
5. 使用返回的 SessionInfo.acpStatus 和 continuityStatus 展示状态。
```

这里要区分：

```text
latestLaneSession
  = 当前 Lane 最近一次关联的 Session，可能已完成或失败。

activeLaneSession
  = 当前 Lane 状态为 running，且本地 AcpManager 仍持有活跃运行时的 Session。
```

封面要展示“当前 Lane 最近一次 Session”时，不应强制要求 `status == running`；只有展示“正在运行”或防止重复自动触发时，才需要使用 active 判定。

### 14.7 `laneSession.sessionId` 与 ACP Session 的关系

前面的讨论需要明确区分“Session 身份关联”和“Session 状态字段”。

在本地 Kanban ACP 场景中：

```text
laneSession.sessionId
  == Routa ACP Session 的 sessionId
  == sessionMap 的 key
```

Rust 自动化路径会先生成一个 Session ID，并使用它创建 `AcpManager` Session；随后创建 `TaskLaneSession` 时继续写入同一个 ID：

- `crates/routa-server/src/api/tasks_automation.rs:261`
- `crates/routa-server/src/api/tasks_automation.rs:273`
- `crates/routa-server/src/api/tasks_automation.rs:635`

TypeScript 自动化路径也会从 `session/new` 响应取得 `result.sessionId`，并使用同一个 ID 写入 `laneSessions[].sessionId`：

- `src/core/kanban/agent-trigger.ts:696`
- `src/core/kanban/agent-trigger.ts:704`
- `src/core/kanban/workflow-orchestrator-singleton.ts:276`

因此 Card 如果已经选出了当前 Lane 的 `laneSession`，可以通过：

```ts
sessionMap.get(laneSession.sessionId)
```

取得与该 Lane Session 对应的 ACP `SessionInfo`。

这里的 ID 是 Routa 管理的 ACP Session ID，不必然等于 Claude 或其他 Provider 内部的原生 Session ID：

```text
Routa ACP sessionId
  -> AcpManager / AcpSessionRecord
  -> 本机 Agent 子进程
  -> Provider 原生 Session 或进程上下文
```

### 14.8 Session 身份相同，但 status 不是同一个字段

同一个 `sessionId` 下存在两种不同的状态投影：

```text
laneSession.status
  = Kanban Lane 这次业务执行的状态

sessionMap.get(laneSession.sessionId)?.acpStatus
  = ACP Runtime Session 的运行时状态
```

例如：

```text
laneSession.sessionId = S1
laneSession.status = "running"
sessionMap[S1].acpStatus = "ready"
```

这是正常的，表示 Lane 业务执行仍在进行，而 ACP Session 已经 ready。

因此应保持以下边界：

```text
身份关系：相同
  laneSession.sessionId == sessionMap 的 key

状态语义：不同
  laneSession.status != acpStatus
```

本次 Card 封面简化方案使用 `latestLaneSession.status` 作为 Kanban 状态；如果详情页或运行时诊断需要 ACP 状态，再通过同一个 `sessionId` 查找 `SessionInfo.acpStatus`。两者不应被强行转换成同一枚举。

## 15. ACP Prompt Turn 的 JSON-RPC 消息形态

官方 ACP 使用 JSON-RPC 2.0。一次 `session/prompt` 不是由一个“stop”事件结束，而是由同一个请求的最终 Response 结束。

### 15.1 典型消息顺序

在 Agent 持续执行任务、没有 Client 主动取消的场景中，消息流可以抽象为：

```text
Client -> Agent: session/prompt 请求
Agent  -> Client: 多条 session/update 通知
Agent  -> Client: 原 session/prompt 请求的最终响应
```

末尾可能类似以下 JSONL（具体通知数量和内容不固定）：

```json
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_123","update":{"sessionUpdate":"tool_call_update","toolCallId":"call_7","status":"completed"}}}
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_123","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"工具执行完成，我正在整理结果。"}}}}
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_123","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"任务结果如下："}}}}
{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_123","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"任务已完成。"}}}}
{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}
```

最后一条不是新的 `stop` 动作，也没有 `method`。它是对原始 `session/prompt` 请求的 Response，`stopReason` 表示 Agent 为什么结束当前 turn。

官方 Prompt Turn 文档要求：当没有 pending tool call 时，Agent 必须对原始 `session/prompt` 返回 `StopReason`。官方正常结束值是 `end_turn`；`end` 不是 ACP v1 的标准值。

官方文档：

- https://agentclientprotocol.com/protocol/v1/prompt-turn
- https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json

### 15.2 `method`、`id`、`result` 的含义

JSON-RPC 消息类型应按字段组合区分：

```text
有 id + method       = Request，要求对方执行方法
有 id + result/error  = Response，对应之前的 Request
有 method、无 id     = Notification，不期待 Response
```

`id` 是请求关联编号，不是 ACP 业务字段，也不表示停止。Client 发出：

```json
{"jsonrpc":"2.0","id":2,"method":"session/prompt","params":{}}
```

Agent 返回时复用 `id: 2`，表示这是同一个请求的结果：

```json
{"jsonrpc":"2.0","id":2,"result":{"stopReason":"end_turn"}}
```

`id: 2` 没有特殊业务含义，实际编号由发送方生成，可以是其他数字或字符串。当前 TypeScript `AcpProcess` 使用递增的 `requestId`，在 `sendRequest()` 中生成 ID，并在 Response 中复用 pending request 的 ID：

- `src/core/acp/acp-process.ts:74`
- `src/core/acp/acp-process.ts:387`
- `src/core/acp/acp-process.ts:417`
- `src/core/acp/acp-process.ts:486`

### 15.3 `session/cancel` 与 `stopReason`

如果 Client 主动取消，官方使用独立的 Notification：

```json
{"jsonrpc":"2.0","method":"session/cancel","params":{"sessionId":"sess_123"}}
```

取消不是 `{ "action": "stop" }`。Agent 中止当前 turn 后，仍然需要对原始 `session/prompt` 返回：

```json
{"jsonrpc":"2.0","id":2,"result":{"stopReason":"cancelled"}}
```

当前 Kanban 的 `AcpProcess.cancel()` 也明确发送 `session/cancel` Notification，不等待 Response：

- `src/core/acp/acp-process.ts:366`

### 15.4 Routa 的 `turn_complete` 是内部包装

ACP 官方最终响应本身没有 `sessionUpdate: "turn_complete"`。Routa 会读取 `session/prompt` Response 中的 `result.stopReason`，在需要时合成内部通知：

```json
{
  "method":"session/update",
  "params":{
    "update":{
      "sessionUpdate":"turn_complete",
      "stopReason":"end_turn"
    }
  }
}
```

这个 `turn_complete` 是 Routa 的内部规范化事件，不是 ACP v1 原始 `SessionUpdate` 类型。相关代码：

- `src/core/acp/session-prompt.ts:168`
- `src/core/acp/acp-process.ts:613`

## 16. `sessionUpdate` 协议值与 Routa 扩展

本节记录 ACP `session/update` 中实际出现的字符串，避免把官方 ACP 值、Provider 适配器扩展和 Routa 本地状态通知混为一谈。

官方参考：

- [ACP v1 schema - SessionUpdate](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json)
- [ACP Prompt Turn - Agent Reports Output](https://agentclientprotocol.com/protocol/prompt-turn#3-agent-reports-output)

### 15.1 ACP v1 官方 `SessionUpdate`

官方 v1 schema 定义的相关值及含义：

| `sessionUpdate` | 官方含义 |
|---|---|
| `agent_message_chunk` | Agent 回复的流式文本片段 |
| `agent_thought_chunk` | Agent 内部思考的流式文本片段 |
| `tool_call` | Agent 发起新的工具调用 |
| `tool_call_update` | 工具调用的状态或结果更新 |

官方 schema 还定义了 `user_message_chunk`、`plan`、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update` 和 `usage_update`。因此前端运行状态判断使用的列表不是官方 `SessionUpdate` 的完整列表。

### 15.2 Routa / Provider 适配器扩展

以下值不在当前 ACP v1 稳定 schema 的 `SessionUpdate` 定义中，是 Routa 或 Provider 适配器使用的扩展：

| `sessionUpdate` | 当前来源和用途 |
|---|---|
| `agent_reasoning_chunk` | 当前源码没有找到生产代码发出；仅在前端运行状态判断和临时调试显示中出现。按当前代码事实，它是 `agent_thought_chunk` 的遗留笔误/无效别名，不会由当前 Provider 适配器产生。ACP 官方对应的标准思考值是 `agent_thought_chunk`。 |
| `tool_call_start` | Claude Code 适配器发出的工具调用开始通知，见 `src/core/acp/claude-code-process.ts:658`。 |
| `tool_call_params_delta` | Claude Code 适配器发出的工具参数增量通知，见 `src/core/acp/claude-code-process.ts:709`。 |
| `turn_complete` | Routa 统一的回合结束通知，由多个适配器和 Rust 服务端生成；例如 `crates/routa-server/src/api/acp_routes.rs:1303`。 |
| `acp_status` | Routa 的 ACP 连接/运行状态通知，不是 Agent 输出事件。SSE 连接建立时服务端会发送 `Connected to ACP session.`，见 `crates/routa-server/src/api/acp_routes.rs:2054`。错误状态还可携带 `status: "error"` 和 `error`。 |

### 15.3 当前前端 `isSessionRunning` 判定

`src/client/components/chat-panel/hooks/use-chat-messages.ts:215` 的实时路径只对以下值设置 `isSessionRunning = true`：

```text
agent_message_chunk
agent_reasoning_chunk
agent_thought_chunk
tool_call
tool_call_start
tool_call_params_delta
tool_call_update
```

实时路径只有收到 `turn_complete` 才设置 `isSessionRunning = false`。收到 `acp_status` 时只记录最近的 `sessionUpdate`，不会修改 `isSessionRunning`。

这两个字段职责不同：

```text
lastSessionUpdateKind
  = 最近收到的 sessionUpdate 字符串

isSessionRunning
  = 前端当前用于停止/发送按钮判定的布尔状态
```

因此 `lastSessionUpdateKind = "acp_status"` 与 `isSessionRunning = true` 可以同时存在；这只表示最近事件是状态通知，而此前的运行状态没有被该通知清零。按钮最终使用 `loading || isSessionRunning`，见 `src/client/components/chat-panel.tsx:762`。

### 15.4 `end_turn` 与 `turn_complete` 不是同一层字段

`end_turn` 属于 ACP `session/prompt` 响应中的 `stopReason` 值，用来说明 Agent 为什么结束本次 prompt。它不是 `sessionUpdate` 类型，也不能替代 `turn_complete` 作为一条实时通知的判别值。

Routa 需要一个统一的“本轮已结束”通知，因为不同 Provider 的结束信息可能来自不同位置：

    ACP prompt response.stopReason = "end_turn"
    Provider session.idle
    或其他 prompt result.stopReason
            -> Routa 合成 session/update
               update.sessionUpdate = "turn_complete"
               update.stopReason = "end_turn" / 其他原因

这样做有两个直接作用：

1. `turn_complete` 作为稳定的事件类型，前端、SSE 流和 history 可以统一监听本轮结束；
2. 具体结束原因仍保留在 `stopReason` 字段中，可以区分 `end_turn`、取消、错误或其他 Provider 返回的原因。

当前通用实现：

- ACP 进程收到只有 `stopReason` 的 prompt result 时合成通知：`src/core/acp/acp-process.ts:613`。
- HTTP prompt 处理在 history 没有已有完成事件时补写通知：`src/core/acp/session-prompt.ts:168`。
- OpenCode 的 `session.idle` 被适配为 `stopReason = "end_turn"`，随后生成 `turn_complete`：`src/core/acp/opencode-sdk-adapter.ts:370`。

因此：

    end_turn
      = 本次 prompt 的一个结束原因

    turn_complete
      = Routa 统一广播的“本轮完成”事件，携带 stopReason
