# AcpManager：运行机制、独立化设计与 Worker 问题记录

本文整合本地 ACP Runtime 调研、AcpManager 独立运行方案及 BackgroundTaskWorker 历史问题调查，作为后续设计与实现的统一参考。

## 阅读口径与阶段边界

- 第一部分记录原调研时的 embedded Tauri/Rust 实现：WebView 和 Rust 后端共用 App 生命周期，AcpManager 是进程内对象。
- 第二部分说明 ACP 协议、Provider 兼容性及 Routa 内部事件。
- 第三部分说明 Kanban Session 身份关联和前端状态投影，区分实际行为与展示建议。
- 第四部分是尚待实施的独立化目标：Routa 在 `3210`，独立 AcpManager 在 `29090`，Routa 重启后 Agent 继续运行。
- 第五部分是 2026-09-22 的 Next.js Worker 404 调查，不代表桌面 Rust 主链路存在同一问题。

本次仅整理文档，未重新核验源码或重跑 Provider 测试。下文源码行号、版本、已修复/未修复和“当前”等描述均保留原调查时点口径；目标方案不表示已经实现。

embedded 模式“不依赖旧 Agent 恢复”和独立化目标“Routa 重启不终止 Agent”属于不同阶段。原调研暂缓处理的重复恢复竞态，在独立化方案中仍须满足幂等、多实例控制及孤儿进程防护要求。

## 一、现有本地运行机制

范围为本地 Tauri App：WebView → Rust/Axum → AcpManager → 本机 Agent，以及 Agent 关联的 TerminalManager 资源。不包含 Remote Agent/A2A、Docker/Sandbox 或前端直接启动 Terminal/PTY。

### 运行拓扑

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

### HTTP Stateless 与 ACP Runtime Stateful

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

### `AcpManager`

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

### Kanban 创建 Session

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

#### Session ID 持久化的两步契约

创建 Agent Session 后，所有创建方必须严格按以下顺序持久化：

```text
1. AcpSessionStore::create(...)
2. AcpSessionStore::set_provider_session_id(session_id, agent_session_id)
```

`create` 写入 Routa Session 的 SQLite 主键和元数据；`set_provider_session_id` 再写入 Provider 返回的真实 Agent Session ID。SQLite 的 `acp_sessions.id` 与 `provider_session_id` 是两个不同字段，不能只完成第一步。

原审计发现以下生产路径曾经只执行第一步：

- `crates/routa-server/src/api/tasks_automation.rs` 的 Kanban 自动化触发路径；已修复为在 insert 成功后立即执行 update。
- `crates/routa-server/src/api/acp_routes.rs` 的 `session/prompt` 内存 Session 缺失时的自动创建路径；当前仍未修复。
- `crates/routa-core/src/rpc/methods/kanban/automation.rs` 的 Kanban RPC 自动化触发路径；当前仍未修复。

普通 `session/new`、`session/load` 重建路径以及 Canvas Session 已执行两步持久化。历史上已经写入但 `provider_session_id` 为 `NULL` 的记录不在本次修复范围内。

### 中断场景

#### WebView/SSE 连接短暂断开

这不是 Agent 执行中断。前端 `BrowserAcpClient` 会：

- 自动重连 SSE。
- 携带 `lastEventId`。
- 后端从持久化 history 回放遗漏事件。

相关代码：

- `src/client/acp-client.ts:684`
- `src/client/acp-client.ts:740`
- `crates/routa-server/src/api/acp_routes.rs:1855`

#### 用户取消当前 prompt

`session/cancel` 会调用 `AcpManager.cancel()`，通常只取消当前 prompt，不等于删除 Session，也不必然 kill Agent 子进程。

相关代码：

- `crates/routa-server/src/api/acp_routes.rs:1217`
- `crates/routa-core/src/acp/mod.rs:1028`

#### 用户 Disconnect

`POST /api/sessions/{sessionId}/disconnect` 会保存当前 history，kill 单个 Agent 子进程，并保留数据库 Session row。它不是全局 App shutdown。

相关代码：

- `crates/routa-server/src/api/sessions.rs:400`
- `crates/routa-server/src/api/sessions.rs:416`
- `crates/routa-server/src/api/sessions.rs:422`

#### Agent 子进程异常退出或 Provider 报错

Rust `AcpProcess` 的 stdout reader 结束后会设置 `alive = false`；pending request 会失败。若没有明确的 `acp_status:error` 或 error history，Task 可能仍保留 `triggerSessionId`，`laneSessions.status` 也可能残留为 `running`。

相关代码：

- `crates/routa-core/src/acp/process.rs:543`
- `crates/routa-core/src/acp/process.rs:765`

#### Tauri App 重启

在现有 embedded 模式下，WebView 和 Rust 后端视为同一个 Tauri App 生命周期：一起启动、一起退出、一起重启。

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

### Session 恢复

#### 手动 Resume

Kanban Task Detail 在 ACP 错误时可以调用 `resumeSession`：

1. 尝试 `session/load`。
2. 如果当前实例已有活进程，返回 `resumeMode: attached`。
3. 如果 Provider 支持，尝试 native resume，返回 `resumeMode: native`。
4. native resume 失败时，创建新 Session，使用旧 transcript 作为恢复上下文，返回 `resumeMode: recreated`。

相关代码：

- `src/app/workspace/[workspaceId]/kanban/kanban-tab-panels.tsx:682`
- `crates/routa-server/src/api/acp_routes.rs:1241`

需要注意：Kanban 的 fallback recovery 更接近“基于旧 transcript 创建新的执行 Session”，不能自动等同于旧 lane execution 的原地恢复。

#### 严格 Resume 的重复请求风险（暂不处理）

当前严格恢复接口 `/api/acp/resume` 以“旧 Agent 已不可用”为前提，直接通过
`AcpManager::load_session*` 启动新的 Agent 进程。它当前不检查同一个 `sessionId`
是否已经由本实例持有活跃进程。

如果同一个 Session 在旧进程仍存活时被重复恢复，`register_managed_session()` 会用新的
`ManagedProcess` 覆盖内存 Map 中的旧条目；旧进程没有经过显式 `kill()`，后续也不再由
`AcpManager` 管理。这可能导致重复 Agent、孤儿进程，以及通知/取消请求只作用于新进程。

这是服务端生命周期管理上的已知风险。当前产品流程按单客户端、单次恢复处理，暂不把
该竞态纳入原调研对应的需求验收，也暂不修改恢复实现。后续如果出现多窗口、重试或并发恢复需求，
应在服务端增加按 Session 串行化/幂等保护：已有活跃进程时返回 attached，或在替换前
显式终止旧进程。

相关代码：

- `crates/routa-server/src/api/acp_routes.rs` 的 `/api/acp/resume`
- `crates/routa-core/src/acp/mod.rs` 的 `register_managed_session()`

#### Run/Rerun/Recover Live Run

Kanban 中的 `Run`、`Rerun`、`Recover Live Run` 最终都是重新触发一次 Agent Session。它们不是统一的旧 Session native resume 操作。

当前 `Rerun` 混合了多种语义：明确失败、Session 已停止、历史记录存在、运行状态未知、用户想启动新尝试等。相关状态模型仍未统一。

### Kanban 重启后的自动恢复

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

### ACP 权限请求

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

### `TerminalManager` 与 `PtyManager`

#### `TerminalManager`

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

#### `PtyManager`

`PtyManager` 是 Tauri 预留的用户交互式终端能力：前端如果调用 `pty_create`，Rust 会创建 PTY shell，并通过 `pty_write/read/resize/kill` 操作它。

产品约束已经明确：前端不得直接唤起 Terminal 或 PTY。当前源码虽保留 `PtyTerminal` 组件和 Tauri commands，但没有发现它被 Kanban 或 Session 页面接入。因此它不属于 Kanban ACP Session 模型，应从本次恢复和关闭分析中排除。

相关代码：

- `apps/desktop/src-tauri/src/pty.rs:25`
- `src/client/components/terminal/pty-terminal.tsx:3`

### Tokio Runtime

Tokio Runtime 不是业务状态管理器，也不只是定时任务调度器。它是 Rust 后端异步执行基础设施，负责：

- Axum HTTP 和 SSE。
- Agent 子进程 stdin/stdout 异步 I/O。
- `tokio::spawn` 后台任务。
- channel、mutex、oneshot 等异步同步原语。
- timeout、sleep、interval 等定时能力。

Kanban prompt、ACP stdout reader、SSE stream、heartbeat、各种 cleanup/watchdog 都运行在 Tokio Runtime 上。

### 当前 graceful shutdown 结论

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

### 推荐的目标关闭顺序

以下关闭建议仅适用于 App 持有 Runtime 的 embedded 模式；独立化后 Routa 退出不应取消或 kill 远程 Agent。若实现 embedded 模式的 App 级 graceful shutdown，建议顺序是：

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

## 二、ACP 协议与 Provider 兼容性

### ACP Prompt Turn 的 JSON-RPC 消息形态

官方 ACP 使用 JSON-RPC 2.0。一次 `session/prompt` 不是由一个“stop”事件结束，而是由同一个请求的最终 Response 结束。

#### 典型消息顺序

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

#### `method`、`id`、`result` 的含义

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

#### `session/cancel` 与 `stopReason`

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

#### Routa 的 `turn_complete` 是内部包装

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

### `sessionUpdate` 协议值与 Routa 扩展

本节记录 ACP `session/update` 中实际出现的字符串，避免把官方 ACP 值、Provider 适配器扩展和 Routa 本地状态通知混为一谈。

官方参考：

- [ACP v1 schema - SessionUpdate](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/v1/schema.json)
- [ACP Prompt Turn - Agent Reports Output](https://agentclientprotocol.com/protocol/prompt-turn#3-agent-reports-output)

#### ACP v1 官方 `SessionUpdate`

官方 v1 schema 定义的相关值及含义：

| `sessionUpdate` | 官方含义 |
|---|---|
| `agent_message_chunk` | Agent 回复的流式文本片段 |
| `agent_thought_chunk` | Agent 内部思考的流式文本片段 |
| `tool_call` | Agent 发起新的工具调用 |
| `tool_call_update` | 工具调用的状态或结果更新 |

官方 schema 还定义了 `user_message_chunk`、`plan`、`available_commands_update`、`current_mode_update`、`config_option_update`、`session_info_update` 和 `usage_update`。因此前端运行状态判断使用的列表不是官方 `SessionUpdate` 的完整列表。

#### Routa / Provider 适配器扩展

以下值不在当前 ACP v1 稳定 schema 的 `SessionUpdate` 定义中，是 Routa 或 Provider 适配器使用的扩展：

| `sessionUpdate` | 当前来源和用途 |
|---|---|
| `agent_reasoning_chunk` | 当前源码没有找到生产代码发出；仅在前端运行状态判断和临时调试显示中出现。按当前代码事实，它是 `agent_thought_chunk` 的遗留笔误/无效别名，不会由当前 Provider 适配器产生。ACP 官方对应的标准思考值是 `agent_thought_chunk`。 |
| `tool_call_start` | Claude Code 适配器发出的工具调用开始通知，见 `src/core/acp/claude-code-process.ts:658`。 |
| `tool_call_params_delta` | Claude Code 适配器发出的工具参数增量通知，见 `src/core/acp/claude-code-process.ts:709`。 |
| `turn_complete` | Routa 统一的回合结束通知，由多个适配器和 Rust 服务端生成；例如 `crates/routa-server/src/api/acp_routes.rs:1303`。 |
| `acp_status` | Routa 的 ACP 连接/运行状态通知，不是 Agent 输出事件。SSE 连接建立时服务端会发送 `Connected to ACP session.`，见 `crates/routa-server/src/api/acp_routes.rs:2054`。错误状态还可携带 `status: "error"` 和 `error`。 |

#### 当前前端 `isSessionRunning` 判定

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

#### `end_turn` 与 `turn_complete` 不是同一层字段

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

### ACP Prompt 类型与 Kimi/Kilo 实测

本节只讨论 ACP `session/prompt` 的 prompt 内容，不讨论 Routa 的
`role`、`specialist_id` 等内部元数据。

#### ACP 没有 `role` 或 `specialist` ContentBlock

ACP v1 中，`session/prompt.params.prompt` 是 `ContentBlock[]`。官方
schema 定义的 `ContentBlock.type` 只有：

```text
text
image
audio
resource_link
resource
```

ACP 没有以下标准类型：

```text
role
specialist
system
```

`session/prompt` 本身代表一条用户消息，Agent 输出通过
`session/update` 的 `agent_message_chunk` 等更新类型返回。因此不能把
role prompt 或 specialist prompt 表示为独立的：

```json
{
  "type": "role",
  "text": "..."
}
```

这不是跨 Provider 可移植的 ACP 请求。Provider 可以自行定义扩展，但
扩展不属于 ACP 标准，不能要求 Kimi、Kilo 或其他 ACP Agent 都实现。

官方参考：

- https://github.com/agentclientprotocol/agent-client-protocol/blob/main/agent-client-protocol-schema/src/v1/content.rs
- https://agentclientprotocol.com/protocol/v1/prompt-turn

#### Kimi ACP 能力

原材料实测的本机 Kimi ACP 版本为 `2.0.2`。发送 `initialize` 后返回的能力为：

```json
{
  "promptCapabilities": {
    "image": true,
    "audio": false,
    "embeddedContext": true
  }
}
```

Kimi 的有效 prompt 类型为：

| 类型 | Kimi 状态 |
|---|---|
| `text` | 支持，ACP 基础能力 |
| `image` | 支持，`image: true` |
| `resource_link` | 支持，ACP 基础能力 |
| `resource` | 支持文本型 embedded resource，`embeddedContext: true` |
| `audio` | 不应使用，Kimi 明确返回 `audio: false` |
| `role` | 不支持 |

Kimi 公开实现的相关代码：

- https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/server.py
- https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/types.py
- https://github.com/MoonshotAI/kimi-cli/blob/main/src/kimi_cli/acp/convert.py

向 Kimi 发送 `type: "role"` 时，服务端返回 `-32602 Invalid params`，并
明确列出允许的标准类型：`text`、`image`、`audio`、`resource_link`、
`resource`。这表示 parser 认识 ACP 的完整联合类型，但不表示所有类型
都被当前 Kimi 能力启用；`audio` 仍因 `audio: false` 不应发送。

#### Kilo ACP 能力

原材料实测的本机 Kilo 版本为 `7.2.49`，通过：

```bash
kilo acp --pure
```

进行 stdio ACP 握手。Kilo 返回：

```json
{
  "agentCapabilities": {
    "promptCapabilities": {
      "embeddedContext": true,
      "image": true
    }
  }
}
```

Kilo 的有效 prompt 类型为：

| 类型 | Kilo 状态 |
|---|---|
| `text` | 支持，ACP 基础能力 |
| `image` | 支持，`image: true` |
| `resource_link` | 支持，ACP 基础能力 |
| `resource` | 支持，`embeddedContext: true` |
| `audio` | 未声明支持，不应发送 |
| `role` | 不支持 |

向 Kilo 发送 `type: "role"` 同样返回 `-32602 Invalid params`，并列出
ACP 的五个标准类型作为合法分支。Kilo 没有声明 `audio` capability，因而
客户端不应向它发送 `audio` block。

#### Dev Prompt 的兼容结论

当前 Rust ACP 实现发送的结构是：

```json
{
  "sessionId": "agent-session-id",
  "prompt": [
    {
      "type": "text",
      "text": "..."
    }
  ]
}
```

相关代码：

- `crates/routa-core/src/acp/process.rs:735`
- `crates/routa-core/src/acp/process.rs:738`

为了同时兼容 Kimi、Kilo 和其他 ACP Provider，role prompt、specialist
prompt、Kanban task prompt 应继续合并成一个 `type: "text"` block：

```text
## Role Instructions
...

## Specialist Instructions
...

## Task
...
```

不要引入 `type: "role"` 或 `type: "specialist"`。这两种类型既不是
ACP 标准，也未被原材料实测的本机 Kimi/Kilo 接受。

## 三、Kanban Session 身份与前端状态

### Kanban Card 封面的 Session 口径

本节只讨论 Kanban Card 封面，不讨论详情弹窗的 `activeSessionId`。

#### 当前实际绑定规则

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

#### `sessionIds` 的范围

`task.sessionIds` 是 Task 级扁平历史数组，表示所有曾经关联过该 Task 的 Session ID。它不携带 Lane、Step、状态或当前运行语义。

本调研不再使用 `sessionIds` 推断 Card 封面的当前 Session。它最多用于历史兼容、运行次数统计或旧数据迁移。

Lane 级关联应使用：

```text
task.columnId
  + task.laneSessions[].columnId
  + task.laneSessions[].sessionId
```

#### `sessionMap` 是什么

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

#### 谁触发 Session backfill

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

#### 当前封面的实际缺口

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

#### 推荐的 Lane 封面口径

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

#### `laneSession.sessionId` 与 ACP Session 的关系

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

#### Session 身份相同，但 status 不是同一个字段

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

原材料另记录的 Card 封面简化方案使用 `latestLaneSession.status` 作为 Kanban 状态；如果详情页或运行时诊断需要 ACP 状态，再通过同一个 `sessionId` 查找 `SessionInfo.acpStatus`。两者不应被强行转换成同一枚举。

上述 ACP 状态展示建议与 Lane 状态简化方案是不同的展示选择；两者均须保留 `laneSession.status` 与 `acpStatus` 的语义边界。本次整合不宣称这些展示方案已实现。

## 四、AcpManager 独立化目标与实施计划

独立化不能仅靠修改端口或前端 base URL。现有 `AppStateInner` 持有具体 `AcpManager`，ACP HTTP、Kanban automation/task handler、Kanban RPC/handoff/orchestration、shared session、canvas、A2A、traces、Sessions API、CLI 和 Tauri RPC 均存在直接依赖，需要通过运行时抽象逐步替换。

入口包括 `crates/routa-core/src/state.rs`、`crates/routa-core/src/acp/mod.rs`、`crates/routa-server/src/api/acp_routes.rs` 和 `apps/desktop/src-tauri/src/lib.rs`。

### 目标

目标是让 Routa 与 AcpManager 成为两个独立的程序：

```text
Routa/Tauri :3210
  -> 调用独立 AcpManager

AcpManager :29090
  -> 管理 Agent 子进程
```

必须满足：

1. AcpManager 独立监听 `127.0.0.1:29090`。
2. Routa 重启时，AcpManager 和其管理的 Agent 子进程不需要重启。
3. Agent Session、SSE 通知和取消操作在 Routa 重启后仍可重新连接。
4. Kanban 的业务 API 与纯 ACP Runtime API 分离。
5. 现有 ACP JSON-RPC 语义尽量保持兼容，迁移不改变 Provider 协议。

### 目标拓扑

```text
Kanban HTML / BrowserAcpClient
  |  HTTP JSON-RPC / SSE
  v
Routa/Tauri :3210
  |-- /api/kanban/...        Kanban 业务接口
  |-- /api/tasks/...         Task 业务接口
  |-- /api/acp               通用 ACP 兼容 facade 或透传层
  |-- /api/mcp               Routa 业务 MCP
  |-- RemoteAcpRuntimeClient
  |
  |  HTTP JSON-RPC / SSE
  v
AcpManager Service :29090
  |-- 纯 ACP Runtime HTTP API
  |-- AcpManager
  |-- TerminalManager
  |-- Provider CLI / Adapter
  |-- Runtime history / event cursor
  |
  |  JSONL JSON-RPC over stdin/stdout
  v
Agent 子进程
```

Agent 到 AcpManager 的链路不是 SSE，而是子进程 stdin/stdout 上的逐行 JSON-RPC。SSE 从 AcpManager 的 HTTP 层开始。

### API 边界

#### Kanban API

Kanban 的业务入口应使用 `/api/kanban` 或其子资源，例如：

```text
/api/kanban/boards
/api/kanban/boards/{boardId}/cards/{cardId}/move
/api/kanban/tasks/{taskId}/run
/api/kanban/tasks/{taskId}/recover
```

具体路径可以按现有 API 兼容性决定，关键要求是：

- Kanban 的列、卡片、任务、Lane、worktree 和自动化语义归属 Routa。
- Kanban 不直接把业务请求当作 `/api/acp` 请求。
- Kanban 需要 Agent 时，由 Kanban service 调用 `AcpRuntime` 抽象。
- 同进程模式下调用内部 service；独立模式下由 remote client 调用 `29090/api/acp`。

当前代码中，Kanban automation 有些路径从 `/api/kanban`、`/api/tasks` 或 `/api/rpc` 进入后直接调用 `state.acp_manager`。这是需要收敛的现状，不是目标边界。

#### AcpManager API

独立 AcpManager 的 `/api/acp` 应是纯 Runtime 接口，只负责：

- ACP `initialize`；
- `session/new`；
- `session/load`；
- `session/prompt`；
- `session/cancel`；
- Provider/Adapter 与 Agent 子进程生命周期；
- Terminal、permission 等 Agent 侧 ACP 请求；
- Session runtime 状态；
- Session SSE 和 history 回放。

它不应负责：

- Routa workspace、task、board、column 或 Lane 状态；
- Kanban 卡片移动和自动推进；
- Routa Agent 注册；
- Routa worktree 业务绑定；
- Routa task prompt 的业务拼装；
- Routa SQLite 中的领域事务。

#### Routa `/api/acp` 的兼容角色

现有 `3210/api/acp` 可以在迁移期保留，但只能有两种明确角色：

1. 通用 ACP caller 的兼容 facade，内部调用 `RemoteAcpRuntimeClient`；
2. 对 `29090/api/acp` 的无业务逻辑 JSON-RPC/SSE 透传层。

它不能继续把 Kanban 业务、Session 持久化策略和 Runtime 控制混在一起。Kanban 新功能必须走 `/api/kanban`，而不是新增更多 `/api/acp` 业务分支。

### 建议的代码抽象

先引入运行时接口，保留本地模式作为迁移和回滚手段：

```text
AcpRuntime
  |-- LocalAcpRuntime
  |     -> 当前进程内 AcpManager
  |
  |-- RemoteAcpRuntimeClient
        -> HTTP JSON-RPC / SSE -> AcpManager :29090
```

建议抽象的能力包括：

```text
create_session
load_session
prompt
cancel
kill_session
get_session
list_sessions
get_session_history
is_alive
subscribe / event stream
```

跨进程的 `subscribe` 不能直接返回 Tokio `broadcast::Receiver`。迁移初期可由 `RemoteAcpRuntimeClient` 建立远程 SSE relay，再在 Routa 内部转成现有本地 broadcast，以减少一次性修改调用方的范围。后续可以把调用方逐步改成显式的异步 event stream。

### 状态归属

#### AcpManager 负责

- Agent 子进程、stdin/stdout/stderr 和 Tokio reader task；
- Provider 原生 Session ID；
- Agent liveness、cancel、kill；
- TerminalManager 和 Agent permission request；
- ACP notification history；
- 稳定 event ID / cursor；
- Provider CLI、Adapter、认证和运行时配置；
- ACP trace，或提供独立的 trace 查询接口。

#### Routa 负责

- workspace、codebase、worktree；
- task、board、column、Lane Session 业务记录；
- Task 与 ACP Session 的关联；
- Kanban 自动化、排队和自动推进；
- MCP 业务工具和领域权限；
- 面向 UI 的 session/task 读模型。

两个进程不应共同打开同一个 `routa.db`。AcpManager 应拥有独立的 Runtime 存储，至少保存：

- Routa Session ID；
- Provider Session ID；
- cwd、workspace 和 launch metadata；
- Runtime history；
- 稳定 event cursor；
- running/completed/error 等 Runtime 状态。

Routa 可以保留 Session 的业务引用或缓存，但不能继续把 Routa SQLite 当作独立 AcpManager 的唯一 Runtime 事实源。

### SSE 链路

目标链路为：

```text
Agent 子进程 stdout JSONL
  -> AcpProcess reader
  -> AcpManager broadcast
  -> AcpManager :29090 GET /api/acp?sessionId=...
  -> Routa :3210 GET /api/acp 透传
  -> Browser EventSource
```

请求方向为：

```text
Browser POST /api/kanban/...
  -> Routa Kanban service
  -> POST :29090/api/acp
  -> AcpManager
  -> Agent stdin JSONL
```

Routa 的 SSE 透传必须是 streaming proxy，不能先读取完整响应再返回。必须保留：

- `Content-Type: text/event-stream`；
- `data:` 内容；
- `id:` 和 `eventId`；
- heartbeat comment；
- 上游 HTTP status 和错误；
- `sessionId`、`lastEventId` 查询参数；
- `probe=1` 的 204 探测语义。

当前 BrowserAcpClient 会携带 `lastEventId` 重连；当前 Axum SSE 已支持事件 ID、history replay 和 heartbeat。独立化后，这些 history 和 cursor 必须由 AcpManager 提供，不能只依赖 Routa 进程内内存。

浏览器断开时，Routa 应只关闭上游 SSE subscription，不应因此取消或 kill Agent prompt。Routa 重启后，BrowserAcpClient 重新连接，Routa 将 cursor 转发给 AcpManager，AcpManager 回放遗漏事件。

`session/prompt` 在部分 Provider 路径上也可能返回 `text/event-stream`，因此不能只代理 GET SSE；POST 的 streaming response 也必须透传。

### MCP 反向依赖

当前 ACP 启动配置会把 Routa MCP 地址写入 Provider 配置，默认形态是：

```text
http://127.0.0.1:3210/api/mcp?wsId=...&sid=...
```

独立 AcpManager 不能因为自身监听 `29090` 就把这个地址变成 `29090/api/mcp`。Session 创建时应显式传入：

- Routa MCP base URL；
- workspace/session 参数；
- 必要的认证 token；
- tool mode 和 MCP profile。

否则 Agent 虽然能在 AcpManager 中继续运行，但会无法调用 Routa 的 Kanban/MCP 工具。Routa 短暂重启期间，MCP 请求可能失败；需要定义 Provider 重试或错误策略。

长期方案可以是将 MCP 也独立出来，或者让 AcpManager 做经过认证的 MCP proxy，但这不是 AcpManager 拆分的第一阶段必需项。

### Routa 重启语义

目标行为：

```text
Routa 退出
  -> RemoteAcpRuntimeClient 消失
  -> AcpManager 不退出
  -> Agent 子进程继续运行

Routa 重启
  -> 等待 AcpManager /health ready
  -> 查询 Runtime sessions
  -> 与 Routa Task/Lane 记录重新关联
  -> 按 event cursor 建立 SSE
  -> 回放 turn_complete / error / process state
  -> 执行 Kanban reconciliation
```

Kanban 自动化不能只依赖 Routa 进程中一次性的 Tokio background task。若 Routa 在 Agent 执行期间重启，恢复逻辑必须能够根据 AcpManager 的持久化事件判断：

- prompt 是否完成；
- 是否发生错误或取消；
- 是否已经调用 `move_card`；
- Lane Session 是否仍然 running；
- 是否需要恢复、重试或标记 interrupted。

### 生命周期与安全

AcpManager 是独立程序时，不应默认由 Routa 临时 fork 后随 Routa 退出。需要明确独立的启动和监督机制：

- macOS：LaunchAgent 或独立用户级 supervisor；
- Windows：用户级服务、计划任务或独立 launcher；
- Tauri 只负责连接、健康检查和版本协商。

服务必须：

- 只监听 `127.0.0.1`；
- 处理端口占用和旧进程残留；
- 提供 `/health`、`/ready` 和版本信息；
- 使用 loopback 之外仍不可推断为安全，增加 bearer token 或 per-instance lease；
- 校验 Session 所属 workspace、cwd 和调用者 lease；
- 防止多个 Routa 实例同时控制一个 Session；
- 传播客户端断开和上游 Agent 异常，但区分 cancel、kill、crash 和 Routa restart。

### 分阶段实施计划

#### Phase 0：契约冻结

- 固定 `/api/acp` JSON-RPC 请求/响应形状；
- 固定 SSE event ID、heartbeat、replay 和 probe 语义；
- 为 `session/new`、`session/load`、`session/prompt`、`session/cancel` 和 SSE 建立 characterization tests；
- 明确 Kanban API 与 Runtime API 的责任矩阵。

#### Phase 1：引入运行时抽象

- 抽取 `AcpRuntime` 接口；
- 将现有 `AcpManager` 包装成 `LocalAcpRuntime`；
- 替换 Kanban、sessions、orchestration、CLI 和 RPC 对具体 `AcpManager` 的直接依赖；
- 保持当前 embedded 模式可运行。

#### Phase 2：实现独立 AcpManager Service

- 新增独立 `routa-acp` binary 或等价服务入口；
- 复用 `routa-core::acp` 的 Provider/Process/Terminal 实现；
- 提供纯 Runtime `/api/acp`、SSE、health 和 runtime session API；
- 禁止独立服务打开 Routa 的领域数据库。

#### Phase 3：实现 Remote Runtime Client

- 配置 `ROUTA_ACP_RUNTIME_URL`，默认 `http://127.0.0.1:29090`；
- 实现 JSON-RPC 请求代理；
- 实现 SSE relay、heartbeat、cursor 和断线重连；
- 保留 Routa `/api/acp` 兼容 facade，但移除 Kanban 业务分支。

#### Phase 4：Kanban 边界收敛

- Kanban Run/Rerun/Recover/automation 统一进入 `/api/kanban` 或 Kanban service；
- Kanban service 通过 `AcpRuntime` 创建和操作 Session；
- 不再从 Kanban UI 直接把业务启动动作发送到通用 `/api/acp`；
- 处理 Routa 重启后的 Task/Lane reconciliation。

#### Phase 5：独立生命周期和交付

- 实现 AcpManager supervisor、启动、升级和端口冲突处理；
- 明确 Provider CLI、认证和 Runtime 数据目录；
- 更新 `DEVELOPMENT.md`、架构 ADR、安装包和启动文档；
- 明确独立 AcpManager 是随应用安装、独立安装，还是由用户预先运行。

### 验收标准

至少需要验证：

1. AcpManager 在 `127.0.0.1:29090` 独立运行，Routa 在 `3210`。
2. 通过 Routa Kanban API 创建任务时，Routa 调用远程 AcpManager，而不是本地 `AcpManager`。
3. Agent 的 JSONL 通信、Provider adapter 和 terminal request 正常。
4. Agent notification 能经过 `29090 -> 3210 -> Browser EventSource` 实时到达页面。
5. SSE `id`、heartbeat、`lastEventId` replay 和 `probe=1` 语义保持不变。
6. Routa 重启不会杀死 AcpManager 或 Agent 子进程。
7. Routa 重启后可以重新发现 Session、重连 SSE 并回放遗漏事件。
8. `turn_complete`、error、cancel 和 `move_card` 的 Kanban 状态不会因重启丢失。
9. Agent 仍能调用正确的 Routa MCP endpoint，而不是错误地调用 `29090/api/mcp`。
10. 多个 Routa 实例、重复连接和重复恢复不会造成孤儿 Agent 或重复 prompt。

## 五、BackgroundTaskWorker 历史问题调查

> 调查时间：2026-09-22。原调查仅分析问题，未修改业务代码；修复方向为待决策选项。

### 症状

- 日志中间歇出现反复 `POST /api/acp`，响应 404。
- 不能稳定复现：只有特定时段出现，出现时会连续多次。

### 根因

`BackgroundTaskWorker` 的 dispatch 循环向 **Next.js 自己的 origin** 发 `POST /api/acp`，但 Next.js 的 `/api/acp` 路由已被删除，因此每个被 dispatch 的 task 都会收到一次 404。

#### 调用链

```text
src/instrumentation.ts（NEXT_RUNTIME === "nodejs"，Next.js 启动即执行）
  -> startBackgroundWorker()
  -> src/core/background-worker/index.ts:47
       dispatchTimer = setInterval(dispatchPending, 5s)
     :48
       completionTimer = setInterval(checkCompletions, 15s)

dispatchPending()
  -> backgroundTaskStore.listReadyToRun() 有 ready 的 PENDING task
  -> dispatchTask() -> createAndSendPrompt()（index.ts:223-309）
       POST {base}/api/acp  session/new    index.ts:262（等待响应）
       POST {base}/api/acp  session/prompt index.ts:293（fire-and-forget）
```

#### 404 的直接原因

`createAndSendPrompt` 的 base URL 由 `getInternalBaseUrl()`（index.ts:30-35）解析：

```text
VERCEL_URL -> NEXTAUTH_URL -> http://localhost:${PORT ?? 3000}
```

即**写死指向 Next.js origin**（本地默认 3000）。但 Next.js 侧 `/api/acp` 已在以下提交中删除：

```text
cb97e59 / fad086c  [nice] 仅保留 rust server 作为接口后端
  删除 src/app/api/acp/route.ts（1245 行）
  同批删除 background-tasks/process、a2a、agents 等一大批 Next.js 路由
```

现在 `/api/acp` 只存在于 Rust server：

```text
crates/routa-server/src/api/mod.rs:84      .nest("/api/acp", acp_routes::router())
crates/routa-server/src/api/acp_routes.rs:28
  .route("/", get(acp_sse).post(acp_rpc))   支持 session/new（:525）
```

worker 没有任何路径会打到 Rust 后端的 3210 端口，因此命中已删除的 Next.js 路由 -> 404。

#### 为什么不能稳定复现

404 不是持续发生，而是五重门控叠加的结果，只有全部满足时才出现：

1. **Worker 只在 Next.js nodejs 进程里启动**（`src/instrumentation.ts`）。桌面端纯跑 Rust server 时不存在这个 worker——同一批后台任务，desktop 下完全不报 404，web/dev 下才会报。

2. **只有队列里有 ready 的 PENDING task 才发 POST**（`dispatchPending` → `listReadyToRun()`）。task 的来源是 scheduler service、工作流或手动排入，本身在时间上随机；队列空时 worker 每 5 秒空转，网络层完全安静。

3. **并发槽门控**：`running.length >= MAX_CONCURRENT_TASKS (2)` 时整个周期直接跳过（index.ts:87-90），已有 2 个 task 在跑时不发任何请求。

4. **每个 task 只 404 一次**：`session/new` 404 后 `dispatchTask` 立即把 task 标 FAILED（index.ts:149-157），同一 task 不会重试。所以"反复 404"实际是一波——每 5 秒一批、每批最多 2 个新 task——直到队列耗尽。之后再次静默，直到新任务排入。

5. **base URL 决定报什么错**（`getInternalBaseUrl`，index.ts:30-35）：
   - 指到**没起服务的端口** → `ECONNREFUSED`，不是 404；
   - 指到 **Next.js dev server**（路由已删） → 404；
   - 指到 **Rust server** → 正常执行，无错误。
   例如 `next dev -p 3001` 但没设 `PORT` 环境变量时，base 落到 3000——那个端口上跑的是什么决定了看到的是 404、连接拒绝还是干脆成功。

表面上的"随机" = ① 跑的哪个后端 × ② 队列里此刻有没有任务 × ③ 并发槽是否空闲 × ④ base 解析到哪个端口。其中 ② 是唯一随时间变化的项，也是"有时候出现、一波过后消失"的直接来源。

### 相关代码位置

```text
src/instrumentation.ts                      启动 worker + scheduler service
src/core/background-worker/index.ts
  :21    DISPATCH_INTERVAL_MS = 5s
  :30-35 getInternalBaseUrl()                写死 Next.js origin
  :223   createAndSendPrompt()
  :262   POST session/new
  :293   POST session/prompt（fire-and-forget）
  :149-157 dispatch 失败 -> task FAILED
src/core/background-worker/index.ts:6-7      文件头注释自述设计就是"内部调用 /api/acp"
```

其他 POST /api/acp 的调用方（`src/core/kanban/agent-trigger.ts:669`、`src/core/tools/kanban-tools.ts:952`）均为单次触发、非轮询，已排除。

### 修复方向（三选一，需产品/架构决定）

1. **改指向 Rust 后端**：`getInternalBaseUrl()` 落到 Rust server（desktop 默认 `http://127.0.0.1:3210` 或配置地址），Rust 的 `acp_rpc` 已支持 `session/new`/`session/prompt`。改动最小，但 worker 的生命周期仍挂在 Next.js 进程上。
2. **进程内直接调用**：worker 不再走 HTTP 回环，直接调用 session 创建/发送的进程内实现（`src/app/api/acp/acp-session-create.ts` 等模块仍在仓库中）。消除对任一 HTTP origin 的依赖。
3. **停用该 worker**：既然 Next.js API 面已整体下线，且 desktop 走 Rust 后端、不跑 Next.js server，worker 在 web 模式下也已失去目标 endpoint。如果 background task 队列能力计划整体迁移到 Rust 侧，可考虑不再从 `instrumentation.ts` 启动它。

注意：无论选哪个方向，`checkCompletions`（index.ts:320-430）里的"session 消失即 COMPLETED""orphan/stale 标 FAILED"逻辑依赖 `getHttpSessionStore()` 的进程内状态，与 dispatch 修复方式存在耦合，修复时需一并确认。

### 遗留观察
