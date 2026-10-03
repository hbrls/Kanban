# AcpManager 独立运行拆分方案

本文记录将 ACP Runtime 从 Routa 进程中拆分为独立程序的目标架构，作为后续设计、实现和验收的基线。

## 1. 目标

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

## 2. 当前实现事实

当前 `AcpManager` 不是独立 HTTP 服务，而是 Rust `AppState` 的内存成员：

```text
Tauri/Routa 进程
  -> AppState
      -> AcpManager
          -> Agent 子进程
  -> Axum HTTP :3210
```

相关代码：

- `crates/routa-core/src/state.rs`：`AppStateInner` 持有 `AcpManager`。
- `crates/routa-core/src/acp/mod.rs`：Session、进程句柄、通知 channel 和内存 history。
- `crates/routa-server/src/api/acp_routes.rs`：`/api/acp` HTTP JSON-RPC 和 SSE route。
- `apps/desktop/src-tauri/src/lib.rs`：Tauri 启动内嵌 Rust/Axum 服务。

当前存在大量直接调用 `state.acp_manager` 的路径，包括：

- ACP HTTP route；
- Kanban automation 和 task handler；
- Kanban RPC、handoff 和 orchestration；
- shared session、canvas、A2A、traces；
- Sessions API；
- CLI 和 Tauri RPC。

因此，修改前端 ACP base URL 或单纯修改端口，不能完成拆分。必须在 Rust 内部增加运行时抽象，并替换这些直接依赖。

## 3. 目标拓扑

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

## 4. API 边界

### 4.1 Kanban API

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

### 4.2 AcpManager API

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

### 4.3 Routa `/api/acp` 的兼容角色

现有 `3210/api/acp` 可以在迁移期保留，但只能有两种明确角色：

1. 通用 ACP caller 的兼容 facade，内部调用 `RemoteAcpRuntimeClient`；
2. 对 `29090/api/acp` 的无业务逻辑 JSON-RPC/SSE 透传层。

它不能继续把 Kanban 业务、Session 持久化策略和 Runtime 控制混在一起。Kanban 新功能必须走 `/api/kanban`，而不是新增更多 `/api/acp` 业务分支。

## 5. 建议的代码抽象

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

## 6. 状态归属

### AcpManager 负责

- Agent 子进程、stdin/stdout/stderr 和 Tokio reader task；
- Provider 原生 Session ID；
- Agent liveness、cancel、kill；
- TerminalManager 和 Agent permission request；
- ACP notification history；
- 稳定 event ID / cursor；
- Provider CLI、Adapter、认证和运行时配置；
- ACP trace，或提供独立的 trace 查询接口。

### Routa 负责

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

## 7. SSE 链路

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

## 8. MCP 反向依赖

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

## 9. Routa 重启语义

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

## 10. 生命周期与安全

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

## 11. 分阶段实施计划

### Phase 0：契约冻结

- 固定 `/api/acp` JSON-RPC 请求/响应形状；
- 固定 SSE event ID、heartbeat、replay 和 probe 语义；
- 为 `session/new`、`session/load`、`session/prompt`、`session/cancel` 和 SSE 建立 characterization tests；
- 明确 Kanban API 与 Runtime API 的责任矩阵。

### Phase 1：引入运行时抽象

- 抽取 `AcpRuntime` 接口；
- 将现有 `AcpManager` 包装成 `LocalAcpRuntime`；
- 替换 Kanban、sessions、orchestration、CLI 和 RPC 对具体 `AcpManager` 的直接依赖；
- 保持当前 embedded 模式可运行。

### Phase 2：实现独立 AcpManager Service

- 新增独立 `routa-acp` binary 或等价服务入口；
- 复用 `routa-core::acp` 的 Provider/Process/Terminal 实现；
- 提供纯 Runtime `/api/acp`、SSE、health 和 runtime session API；
- 禁止独立服务打开 Routa 的领域数据库。

### Phase 3：实现 Remote Runtime Client

- 配置 `ROUTA_ACP_RUNTIME_URL`，默认 `http://127.0.0.1:29090`；
- 实现 JSON-RPC 请求代理；
- 实现 SSE relay、heartbeat、cursor 和断线重连；
- 保留 Routa `/api/acp` 兼容 facade，但移除 Kanban 业务分支。

### Phase 4：Kanban 边界收敛

- Kanban Run/Rerun/Recover/automation 统一进入 `/api/kanban` 或 Kanban service；
- Kanban service 通过 `AcpRuntime` 创建和操作 Session；
- 不再从 Kanban UI 直接把业务启动动作发送到通用 `/api/acp`；
- 处理 Routa 重启后的 Task/Lane reconciliation。

### Phase 5：独立生命周期和交付

- 实现 AcpManager supervisor、启动、升级和端口冲突处理；
- 明确 Provider CLI、认证和 Runtime 数据目录；
- 更新 `DEVELOPMENT.md`、架构 ADR、安装包和启动文档；
- 明确独立 AcpManager 是随应用安装、独立安装，还是由用户预先运行。

## 12. 验收标准

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

## 13. 最终架构判断

该拆分方案可行，但“只换端口”是不够的。正确的迁移方向是：

```text
Kanban API
  -> Routa Kanban orchestration
  -> AcpRuntime abstraction
  -> Remote AcpManager HTTP JSON-RPC/SSE
  -> Agent subprocess JSONL
```

`/api/kanban` 负责业务编排，`29090/api/acp` 负责纯 ACP Runtime，Routa 的 `/api/acp` 仅作为兼容代理或 facade。SSE 多跳透传在协议上可行，但必须配合 streaming proxy、稳定事件游标、持久化 history 和重启后的 reconciliation 才能满足独立运行目标。
