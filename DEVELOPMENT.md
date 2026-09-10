# Routa 开发与最终交付规范

本文定义 Routa 的二开范围和最终交付边界。最终交付为 Tauri 桌面应用。

不包含：
- Web 独立部署
- Docker
- Remote Worker
- PostgreSQL
- Linux
- E2E 测试
- Fitness 检查

当前采用按能力划分运行归属的渐进式双后端：Rust 已 ready 的能力由 Rust/Axum 独立承担；尚未迁移的兼容 API 或 TypeScript 运行时能力可以继续由 Next.js Node Server 承载。

已确认但尚未修复的实现问题记录在 [BUGS.md](BUGS.md)。本文件只定义开发规范、架构边界和交付要求，不展开具体 bug 的复现与修复记录。

## 1. 目标交付形态

最终交付物必须是 macOS 或 Windows 上的 Tauri 安装包：

```text
Tauri Desktop
    ├── Next.js 生产构建导出的 HTML/JavaScript/CSS
    ├── Tauri 进程内的 Rust/Axum 本地服务
    ├── SQLite
    ├── Dispatcher
    └── LocalWorker
          └── 本机 Agent 在 /path/to/app-project 工作
```

Routa 不部署成浏览器访问的独立 Web 应用。这里的 Web 只指前端技术形态：Tauri 使用系统 WebView 渲染 React/Next.js 生成的页面。

## 2. Next.js 的作用

生产构建：生成静态 HTML/JS/CSS，打包进 Tauri。不是 SSR，不需要 Next.js Server。

开发模式：`tauri dev` 启动 Next.js dev server（`localhost:3110`），仅供开发使用。

### 2.1 后端运行约束

- 已迁移接口：Rust/Axum 提供（`127.0.0.1:3210`），前端通过 `resolveApiPath` / `desktopAwareFetch` 调用
- 未迁移接口：保留 Next.js route 作为兼容，需启动 Next.js Node Server

禁止：
- 为已迁移接口恢复 Next.js route
- 前端直接使用 `fetch('/api/...')`

迁移规则：
- 只删除 `src/app/api/**/route.ts`（路由层）
- 保留 `src/core/**` 底层实现

## 3. Rust/Axum 本地后端

默认模式 `rust`：Tauri 内嵌 Axum 服务（`127.0.0.1:3210`），提供：

- 静态前端
- REST/JSON API（`/api/*`）
- SSE、ACP、MCP、JSON-RPC
- SQLite 访问
- Agent、工作区、任务、会话、Git 管理

部分调用通过 Tauri IPC `invoke` 直接进入 Rust（如 `rpc_call`）。

### 3.1 API 迁移与唯一归属

规则：
- 同一 `method + path` 只能归属一处（Rust 或 Next.js）
- Rust 已实现 → 删除对应 `src/app/api/**/route.ts`
- 保留 `src/core/**` 底层实现
- 路径不同 ≠ 同一接口，逐 `method + path` 对比

迁移状态：
- 已删除：236 个 contract endpoint + 8 个重复 route
- 保留：20 个 Next route（21 个 endpoint），待 Rust 迁移后删除

`pnpm api:check` 需改为按 `method + path` 检查唯一归属。

## 4. Dispatcher 与 Worker

业务角色和运行载体必须分开理解：

- **Dispatcher**：拆解任务、分派任务、跟踪状态、接收结果、决定下一步。
- **Worker**：实际启动 Agent、修改代码、执行命令、返回结果。
- **LocalWorker**：Worker 的本机实现，直接在用户机器上启动 Agent 进程。

桌面交付只使用 Local Worker：

```text
Dispatcher
    -> LocalWorker
        -> 本机 Agent CLI
            -> /path/to/app-project
```

Docker 不是 Worker 的同义词。Docker 只是另一种可选运行载体；桌面交付不使用 Docker Worker，Remote Worker 也不纳入交付范围。

Routa 已有 `LocalWorker` 抽象和实现，并通过 `AcpProcessManager` 启动本地 Agent。Dispatcher 必须为每个任务传入明确的仓库路径，并贯通“任务仓库路径 -> LocalWorker -> Agent 工作目录”的传递链路。已知实现问题见 [BUGS.md](BUGS.md)。

## 5. Docker 的业务价值与交付判断

Docker 在仓库中对应两类可选能力：

1. `docker-opencode`：在容器内运行 OpenCode Agent。
2. `SandboxManager`：启动 Python/Jupyter/FastAPI 容器执行代码。

它们提供的是运行环境隔离、固定工具环境、可销毁重建的执行环境，不是 Dispatcher 或 Worker 本身。

在上述模型中，Worker 直接在本机的 `/path/to/app-project` 工作。只要不要求容器化 Agent 或独立代码执行沙箱，Docker 不提供必要的业务能力，应从交付范围排除。

如果多个 Worker 同时挂载同一个本地目录，Docker 也不能解决文件覆盖、Git 冲突或任务重叠问题；这些必须由 Dispatcher 的排队、目录分工或 Git worktree 策略解决。

## 6. 数据与运行时边界

数据库固定为 SQLite：

- 不使用 PostgreSQL 或 Neon。
- 不需要单独安装数据库服务。
- SQLite 文件由应用管理，默认位于应用数据目录的 `routa.db`，也可通过 `ROUTA_DB_PATH` 显式指定。
- 默认 `rust` API 模式下，Rust/Axum 的 `AppState` 是数据库唯一权威；WebView 通过本地 API 或 Tauri IPC 访问业务数据，不能建立第二套数据源。
- 应用必须维护明确的 Schema 版本、迁移、备份、恢复和数据库生命周期策略。

对于 Rust 已 ready 的桌面能力，最终用户不需要运行独立的 Next.js Server、Rust Server 或 SQLite Server，Rust/Axum 和 SQLite 都随 Tauri 应用运行。若交付范围包含仍依赖 TypeScript runtime 或未迁移兼容 API 的功能，则还必须明确打包、启动和维护 Next.js Node Server；不能笼统声称所有运行面都不需要 Node.js。

## 7. 最终用户的交付前置条件

目标平台只包括 macOS 和 Windows。

最终用户机器需要：

- macOS 或 Windows
- 系统 WebView：macOS 使用系统 WebKit；Windows 需要 WebView2 Runtime
- Git
- 至少一个受支持的本地 Agent CLI
- Agent 的认证信息
- 对 `/path/to/app-project` 的读写和命令执行权限
- 可用的本地 API 端口，默认是 `127.0.0.1:3210`

在只使用 Rust 已 ready 能力的桌面模式下，最终用户不需要安装：

- Node.js 或 npm
- Rust 或 Cargo
- Next.js Server
- SQLite Server
- Docker Engine/Desktop
- PostgreSQL
- Linux 运行环境

如果交付范围启用了尚未迁移的 Next.js API 或 TypeScript/Node runtime，则 Node.js/npm/Next.js Server 必须由应用随包管理，或明确列为该兼容运行面的安装前提；不得一边依赖它们，一边宣称所有桌面运行面都不需要 Node.js。

Agent 可选路径包括 Claude、OpenCode、Codex 等。具体 Provider 是否需要 API Key、CLI 登录或其他认证，由 Provider 本身决定。

## 8. 开发必须遵守的设计契约

### 8.1 仓库路径

每个任务必须明确绑定本地仓库：

```text
repositoryPath = /path/to/app-project
```

LocalWorker 必须以该路径启动 Agent，不能依赖进程当前目录或其他隐式路径。已知路径传递缺陷见 [BUGS.md](BUGS.md)。

### 8.2 并发策略

同一目录中的任务默认串行执行。需要并行时，必须使用独立 Git worktree，或由 Dispatcher 明确保证任务修改范围不重叠。

### 8.3 Worker 生命周期

实现必须定义并保证：

- Dispatcher 如何创建和调度 LocalWorker
- LocalWorker 如何启动和终止 Agent CLI
- 应用退出时如何清理 Agent 进程
- Agent 异常退出如何更新任务状态
- Worker 最大并发数和超时规则

### 8.4 Provider 管理

每个受支持的 Agent Provider 必须明确 CLI 的来源：由用户预先安装、由应用管理，或随安装包分发。认证信息必须有明确的保存和更新方式，凭据不得以明文写入 SQLite 或会话日志。

### 8.5 本地 API

Axum 默认只监听 `127.0.0.1`。实现必须处理端口占用、旧进程残留和启动失败提示，并保持 Tauri IPC 与 REST API 的职责边界清晰。

### 8.6 Workspace 语义

项目仍存在部分 `default` workspace fallback。新增功能不得继续引入隐式默认 workspace；`workspaceId`、codebase 和本地仓库路径必须显式关联。兼容既有 fallback 时，应把兼容逻辑限制在明确的边界内。

### 8.7 双后端契约的适用范围

仓库历史上存在 Next.js 与 Rust 双后端实现，当前采用渐进式迁移而非全量 Rust-only。对已迁移能力，Rust/Axum 是唯一的业务 API 权威后端，桌面端应直接使用 Rust；原有对应 Next.js API route 应逐步迁移并删除，不能让同一个 method + path 在两处并存。对尚未迁移的 API，可以暂时保留 Next.js route 作为兼容实现。`src/core/**` 中仍由 Node 执行的服务端 runtime 也属于兼容运行面，例如 `KanbanWorkflowOrchestrator`；它不是浏览器代码。是否在生产 App 中启用这类兼容运行面，必须以实际启动模式和进程取证为准，不能仅凭源码中仍存在该模块得出结论。

## 8.8 Kanban 自动推进列

Kanban 卡片所在列由 `columnId` 表示；`status` 是根据列 stage 同步出的任务状态投影，不是 `bucket`。

创建任务可以通过 Kanban 页面、任务 REST API 或 MCP `create_task` 完成。未指定目标列时，任务会绑定到默认 board 的 `backlog` 列；这解释了批量创建任务后它们首先都出现在 backlog。任务在列之间流转时，前端或 Agent 使用 `move_card`（或等价的 Rust API）提交目标 `columnId`，服务端同步任务的 `status` 并记录列转换事件。

在历史/当前 TypeScript 实现中，正常的自动推进不是 cron 扫描，而是 Next.js Node 进程内的事件回调：

```text
Agent session 完成
    -> AGENT_COMPLETED
    -> EventBus handler
    -> 校验成功和 completion criteria
    -> autoAdvanceOnSuccess
    -> 更新 columnId/status
    -> COLUMN_TRANSITION
    -> 启动下一列自动化
```

该实现中的 `KanbanWorkflowOrchestrator.start()` 位于 `src/core/kanban/workflow-orchestrator.ts`，注册进程内 `EventBus` handler，并创建 30 秒 `setInterval` watchdog。它依赖 Node.js 的 `RoutaSystem`/store/event runtime，不在浏览器或 WebView 中执行。watchdog 只用于 recovery 模式下发现异常或不活跃 session，不是正常完成后的 dispatch 机制。

Rust 侧已经 ready 的 Kanban 能力（例如 `move_card`、进入自动化列时触发 Agent、任务和 ACP 持久化）应直接走 Rust，不需要 Next.js Server。TypeScript orchestrator 提供的“收到 `AGENT_COMPLETED` 后自动移动下一列并链式触发”是另一套 Node 运行时语义；在 Rust-only 运行面中不能假定这段 TypeScript 编排器存在，也不能因为生产中的 Kanban 基础流程正常就反推出它正在运行。

### 8.8.1 Kanban 编排运行时核对（2026-09-08）

本节记录一次针对“生产中似乎存在 `KanbanWorkflowOrchestrator`”的源码审计，避免把静态资源、开发进程和生产运行时混为一谈。

- `KanbanWorkflowOrchestrator` 通过 `src/core/routa-system.ts` 和 Node/MCP 入口加载；它维护全局 singleton、订阅 TypeScript `EventBus`，并负责完成事件处理、watchdog、恢复和自动推进。
- 静态前端没有直接 import 该模块。静态构建产物 `out/` 和 `apps/desktop/src-tauri/frontend/` 中未检出该类或其 watchdog 特征文本，因此不能把它解释成静态 HTML/浏览器 JS 中的调度器。
- Rust 的 `AppState` 确实常驻 `EventBus`、`AcpManager` 和各类 stores，但当前源码审计没有找到 App 启动时注册的 Rust Kanban 全局 orchestrator。Rust 的 `event_bus.on(...)` Kanban 用法目前主要是 `/api/kanban/boards/events` 的 SSE 页面订阅，连接结束会注销，职责是刷新 UI，不是工作流调度。
- Rust 侧仍有独立的 Kanban automation：卡片创建/移动到自动化列时启动 agent，读取并恢复失效的 entry automation，并在 prompt 中要求 agent 在完成时调用 `routa-coordination_move_card`。这条“agent 主动移动卡片 -> Rust 再触发下一列”的链路可以解释生产中观察到的正常 Kanban 行为，不需要 TypeScript orchestrator。

当前未解的问题：

1. 正在使用的生产 `.app` 是否确实采用默认 `ROUTA_DESKTOP_API_MODE=rust`，还是通过环境变量、外部启动器或旧版产物启用了 `embedded`/其他兼容模式。
2. 生产中若观察到“`AGENT_COMPLETED` 事件在没有后续页面请求或 agent `move_card` 调用的情况下自动推进”，其常驻订阅者和进程归属尚未在源码中定位。
3. 需要对实际 `.app` 做进程树、监听端口、启动日志和事件 trace 取证，才能确认生产运行时是否存在额外的 Next.js Node 进程，以及该进程是否承载 TypeScript orchestrator。

默认列通常是 `backlog -> todo -> dev -> review -> done`，另有 `blocked`。`backlog` 自动化默认绑定 Backlog Refiner，并配置成功后自动推进；其他列是否自动推进由各列 automation 配置决定。

## 8.9 Kanban 启动与空状态诊断

`No board available yet.` 可能只是首屏加载期间的临时状态，不等同于 Rust API 缺失。Rust 的 `GET /api/kanban/boards?workspaceId=...` 会确保默认 board 并返回 `{ boards: [...] }`；启动时数据库初始化或首次请求尚未完成时，前端可能先以空数组渲染，随后才显示 board。

如果页面最终没有 board，首先检查：

1. 页面是否正在调用 `127.0.0.1:3210` 的 Rust API，而不是已删除 route 的 Next 开发端口。
2. Rust `/api/kanban/boards` 是否返回 HTTP 200 和 `boards` 数组。
3. 是否只是 Rust 服务启动或数据库初始化延迟。

Kanban 页面应区分 loading、请求失败和确实没有 board 三种状态，不能用同一条空状态文案覆盖三者。

已对 Rust `GET /api/kanban/boards?workspaceId=default` 做过直接请求验证，响应为 HTTP 200，耗时约 3--7ms。因此“后来出现 board”更符合服务启动、数据库初始化或首屏请求竞态，不是 Kanban boards API 本身性能过慢。若要优化体验，应修正 loading/empty/error 状态和启动等待提示，而不是恢复已删除的 Next API。

## 9. 最终判断

桌面交付按已实现能力组合运行面：

```text
Tauri
  -> 静态前端资源
  -> 内嵌 Rust/Axum + SQLite
  -> Dispatcher
  -> LocalWorker
  -> 本机 Agent
  -> /path/to/app-project
```

已迁移到 Rust 的能力使用上述链路即可。若交付功能仍依赖尚未迁移的 Next.js API 或 TypeScript runtime，则在此链路之外增加兼容的 Next.js Node Server，并明确其启动、打包和依赖边界。桌面交付不包含 Docker。只有明确增加“容器化 Agent”或“独立代码执行沙箱”业务时，才需要重新评估 Docker。

## 10. 开发环境与依赖规范

### 10.1 包管理器

本项目是 pnpm workspace，根目录 `package.json` 固定使用 `pnpm@9.15.9`。workspace 范围由 `pnpm-workspace.yaml` 定义，包含：

- `apps/desktop`
- `packages/office-render`

`.npmrc` 配置为：

```ini
lockfile=true
shared-workspace-lockfile=false
```

初始化依赖只使用：

```bash
pnpm install
```

不需要 `npm --prefix apps/desktop install`，也不需要 `--legacy-peer-deps`。不要混用 npm 和 pnpm 生成依赖树或 lockfile。

### 10.2 Tauri 版本锁定

桌面端的 JavaScript 与 Rust Tauri 直接依赖均使用精确版本约束，不能改回 `"2"`、`"^2.0.0"` 或其他浮动范围。

桌面端核心版本必须保持为：

```text
@tauri-apps/api       2.10.1
@tauri-apps/cli       2.10.1
tauri                 2.10.2
```

Rust 插件与对应 JavaScript 插件必须保持相同的 major/minor 版本。patch 版本可以不同，但不能出现例如 Rust `tauri-plugin-notification 2.4.x` 对 JavaScript `@tauri-apps/plugin-notification 2.3.x` 的组合，否则 `tauri dev` 会在启动时终止。

`apps/desktop/src-tauri` 是根 Cargo workspace 的成员，Cargo 实际使用仓库根目录的 `Cargo.lock`；`apps/desktop/src-tauri/Cargo.lock` 不参与 workspace 解析，不能用它判断实际安装版本。Cargo 命令统一从仓库根目录执行。

### 10.3 启动方式

依赖安装完成后，从仓库根目录启动桌面开发环境：

```bash
pnpm tauri:dev
```

该命令执行 `pnpm --filter routa-desktop dev`，随后 Tauri 的 `BeforeDevCommand` 启动根目录 Next.js 开发服务。Rust/Axum 本地 API 默认监听 `127.0.0.1:3210`，前端开发服务固定监听 `http://localhost:3110`。

开发端口和进程职责如下：

| 命令/运行面 | 进程 | 默认端口 | 职责 |
|---|---|---:|---|
| `pnpm tauri:dev` | Next.js dev server | `3110` | Tauri WebView 的开发页面与资源，并承载仍保留的 Next.js API routes；不是独立部署的 Web 应用 |
| `pnpm tauri:dev` | Tauri 进程内 Rust/Axum | `3210` | 桌面 API、SSE、ACP、MCP、SQLite-backed domain runtime |
| `pnpm tauri:build` 构建期间 | Next.js static build | 无常驻监听端口 | 生成静态 HTML/JavaScript/CSS 后退出 |
| 构建后的 `.app`，源码默认模式 | Tauri 进程内 Rust/Axum | `3210` | 提供打包静态前端和 Rust API |

`3001` 不是 Routa Desktop 主运行面的默认端口；当前只在少数历史 E2E 地址和 Docusaurus 文档示例中出现。`ROUTA_DESKTOP_API_PORT` 可以覆盖 Rust/兼容 API 端口；Tauri 开发页面的 `devUrl` 和根 `package.json` 的 `dev` 脚本当前都固定使用 `3110`。

可用以下命令确认 Tauri CLI 和 Rust crate 的解析版本：

```bash
pnpm --filter routa-desktop exec tauri --version
cargo tree -p routa-desktop --depth 1
cargo check -p routa-desktop
```

### 10.4 明确排除的开发机制

以下机制不属于开发或交付目标，不能作为安装、启动、构建或 Git 提交的前置条件：

- E2E 测试及 Playwright
- Fitness 检查及 entrix
- CI 流程
- Docker
- Git hooks，包括 Husky

需要验证时由开发者按需执行与当前改动直接相关的检查，验证过程不绑定 Git commit 或 push。

### 10.5 Codex Provider、ACP Adapter 与 Desktop 内置 Runtime

Codex provider 必须把以下节点分开理解：

```text
Routa
    -> Codex ACP adapter
        -> Codex app-server / runtime
```

`codex-acp` 不是 Routa 自己实现的功能，也不是 Codex Desktop App 的 UI。它是一个独立的 ACP adapter，负责把 Routa 的 ACP JSON-RPC 请求转换为 Codex app-server 请求，再把 Codex 事件转换回 ACP `session/update` 通知。

截至 2026-09-04，公开发布物有两个阶段：

- `@zed-industries/codex-acp@0.16.0`：旧实现，仓库已经归档；npm 包主要是 Node.js launcher，按平台启动配套的原生 adapter binary。
- `@agentclientprotocol/codex-acp@1.8.0`：后继实现，仓库仍维护；npm 包是 TypeScript/Node.js ACP server，依赖 `@openai/codex`，启动 `codex app-server` 并做协议转换。

正确的包名是 `@agentclientprotocol/codex-acp`，不是 `@agentclientprotocal/codex-acp`。

Routa 当前的静态 provider preset 将 `codex` 映射为命令 `codex-acp`：

```text
provider id: codex
command:     codex-acp
```

Routa 不通过 Python SDK 调用它，而是启动一个子进程，并通过 stdin/stdout 使用 ACP JSON-RPC：

```text
initialize
session/new
session/load
session/prompt
session/cancel
```

Web/Next.js 运行面由 TypeScript/Node.js 的 `AcpProcess` 启动子进程；Tauri 运行面由 Rust/Axum 使用 `tokio::process::Command` 启动子进程。两者的通信形态相同，都是 JSON-RPC request/response 加 agent notification，不是 HTTP，也不是 Tauri IPC。

#### Adapter 与 Runtime 的路径配置

两个环境变量职责不同：

```text
CODEX_ACP_BIN
    Routa 启动哪个 ACP adapter

CODEX_PATH
    ACP adapter 启动哪个 Codex 可执行程序
```

Routa 解析 ACP adapter 的优先级是：

```text
1. CODEX_ACP_BIN
2. 当前项目 node_modules/.bin/codex-acp
3. PATH 中的 codex-acp
```

因此 `CODEX_ACP_BIN` 可以指向 Zed 旧 adapter、Agent Client Protocol 后继 adapter，或团队自有的兼容实现；替代物必须是可执行 ACP server，能够通过 stdin/stdout 处理 Routa 使用的 ACP 方法。它不能指向任意普通 CLI。

使用后继 adapter 时，`CODEX_PATH` 可以指向指定的 Codex binary：

```bash
npm install -g @agentclientprotocol/codex-acp@latest
export CODEX_ACP_BIN="$(command -v codex-acp)"
export CODEX_PATH="/Applications/ChatGPT.app/Contents/Resources/codex"
```

adapter 随后会以 app-server 模式启动：

```text
/Applications/ChatGPT.app/Contents/Resources/codex app-server
```

这表示复用 Codex Desktop App 安装包内的 Codex 执行程序和 runtime，而不是连接 Desktop UI。`CODEX_PATH` 不是 Desktop App thread API，也不能让 Routa 访问 Desktop UI 中已有的 thread、`create_thread` 或 `wait_threads`。

术语边界如下：

```text
Codex Desktop App  = 桌面 UI 与宿主应用
codex              = Codex 可执行程序入口
codex app-server   = 面向程序调用的 JSON-RPC 入口
Codex runtime      = 执行模型请求、工具调用和代码任务的实际能力
codex-acp          = ACP 与 Codex app-server 之间的适配层
```

在当前实现中，`runtime` 可以由 Desktop App 包内的 `codex` binary 承载，但 Routa 使用的是它的 `app-server` 模式，不是交互式终端 CLI 模式。

#### 安装与交付约束

若开发环境通过 npm 全局安装 adapter，安装和运行该 JavaScript launcher 需要 Node.js/npm：

```bash
npm install -g @agentclientprotocol/codex-acp@latest
codex-acp --version
```

生产 Tauri 交付不能只写“机器上有 Codex Desktop 就可用”。必须明确选择以下一种方式：

- 预先安装并验证 `codex-acp`，同时配置 `CODEX_ACP_BIN`；
- 将兼容的 ACP adapter 作为应用管理的依赖或平台 binary 分发；
- 将 adapter 及其 Node/Bun runtime 一起打包，避免要求最终用户单独安装 Node.js/npm。

验证时至少检查：

```bash
command -v codex-acp
CODEX_PATH="/Applications/ChatGPT.app/Contents/Resources/codex" codex-acp --version
```

`codex-acp --version` 只能验证 adapter 入口可运行；端到端可用性还需要实际完成 ACP `initialize`、`session/new` 和 `session/prompt`，并确认底层 Codex binary 支持 `app-server`。Desktop App 内置 binary 的版本与 adapter 版本必须兼容，模型不兼容时会由底层 Codex 返回错误。

#### Desktop App thread API 的边界

Codex Desktop App 的 `create_thread`、`read_thread`、`wait_threads` 等任务管理能力属于 Desktop App 的宿主接口，不属于 ACP adapter 协议。当前 Routa 的 `codex-acp` 集成不会调用这些接口，也不会连接 Desktop UI 中已经存在的 thread。

如果未来接入 Desktop App 的 thread API，`wait_threads` 应记录为一种带超时的 long polling 操作：调用方提交 `threadId`、`hostId` 和可选的 `afterCursor`，请求在状态发生变化、任务完成、需要处理或超时时返回；超时后由调用方使用最新 cursor 再次等待。它与当前 Routa 的 ACP `session/prompt` / `session/update` 链路是两套不同的接口，不能把 `turn_complete` 与 Desktop App 的 `wake.reason = turnCompleted` 混写成同一个协议字段。

### 10.6 macOS 构建与交付产物

当前交付范围只包含 Apple Silicon macOS，不支持 Intel，也不要求生成 universal binary。实际交付物是可直接复制的 `.app` bundle，不是 DMG。

Tauri 的构建配置必须保持只生成 macOS app：

```json
"bundle": {
  "active": true,
  "targets": ["app"]
}
```

`.app` 虽然在 Finder 中显示为一个文件，但本质是一个目录包。必须复制整个目录：

```text
target/release/bundle/macos/Routa Desktop.app/
```

不能只复制其中的 `Contents/MacOS/routa-desktop`，因为运行时还需要 `.app` 内的静态前端、specialist 和 feature-tree 资源。

构建入口和产物边界如下：

```text
pnpm run build:static
    -> out/                                  静态 Next.js 前端中间产物

pnpm tauri:build
    -> beforeBuildCommand
    -> scripts/prepare-frontend.mjs
    -> out/ 复制到 apps/desktop/src-tauri/frontend/
    -> Tauri 编译 routa-desktop
    -> target/release/bundle/macos/Routa Desktop.app/
```

`target/release/routa-desktop` 是 Cargo 生成的裸 Mach-O 可执行文件，只用于底层构建或调试，不是完整桌面交付物。完整交付应使用：

```text
target/release/bundle/macos/Routa Desktop.app/
```

从当前源码看，默认 `ROUTA_DESKTOP_API_MODE` 为 `rust`。按该默认分支启动 `.app` 时，Tauri 进程内嵌 Rust/Axum 服务并监听 `127.0.0.1:3210`，不会同时启动 Node.js/Next.js Server；SQLite 是进程内数据库文件，也没有独立端口。Rust 服务优先从安装包 resource 目录读取：

```text
Contents/Resources/frontend/
Contents/Resources/bundled/feature-tree/
Contents/Resources/specialists/
```

验证 macOS 交付产物时至少确认：

```bash
file target/release/bundle/macos/Routa\ Desktop.app/Contents/MacOS/routa-desktop
find target/release/bundle/macos/Routa\ Desktop.app/Contents/Resources/frontend \
  -maxdepth 2 -type f | head
```

前一条应显示 `Mach-O 64-bit executable arm64`。按源码默认模式运行 `.app` 后，日志应出现 `[rust-server] Starting embedded Rust backend server`，而不是启动 Node standalone server。

上述内容描述的是当前源码和标准 `pnpm tauri:build` 链路，不等于对任意历史或本机已有 `.app` 产物的运行时证明。若生产中观察到只有 TypeScript/Node 编排器才能解释的行为，必须进一步检查：

```bash
ps aux | rg 'routa|server.js|next'
lsof -nP -iTCP -sTCP:LISTEN | rg '3110|3001|3210|node|routa'
```

同时保留 App 启动日志，确认实际 `ROUTA_DESKTOP_API_MODE`、最终 API URL、是否出现 `[desktop-server] Starting embedded server`，以及是否存在 Node 子进程。没有这些证据前，不应断言实际生产产物一定是 Rust-only，也不应断言 TypeScript `KanbanWorkflowOrchestrator` 已随静态前端运行。

构建 Agent 与测试 Agent 的职责必须分离。构建流程只允许执行 `next build`、Rust 编译和 Tauri 打包；不得在构建脚本中调用 Vitest、Playwright 或任何 `test:*` 命令。`next build` 的类型检查属于构建步骤，不等同于执行测试用例。

`pnpm run build:desktop` 只生成 standalone 兼容 bundle 和静态前端，不生成 Tauri 安装包，也不属于当前 macOS `.app` 交付入口。当前正式交付使用 `pnpm tauri:build`，并且不生成 DMG。
