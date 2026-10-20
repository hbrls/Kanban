# Routa 开发规范

本文说明当前桌面应用的结构、运行方式和开发约束。具体行为以源码为准；已确认的问题与修复方向统一记录在本文末尾。

## 1. 应用结构

Routa 是以 Workspace 为边界的本地 Agent 协调应用。桌面运行链路为：

```text
Tauri Desktop
    ├── React / Next.js 静态前端
    └── 进程内 Rust/Axum 服务
          ├── SQLite
          ├── REST / JSON-RPC / MCP / SSE
          ├── Kanban Task Automation
          └── AcpManager
                └── 本机 Agent 进程
                      └── 任务关联的仓库或 Git worktree
```

默认 `ROUTA_DESKTOP_API_MODE=rust`。Tauri 创建共享 `AppState`，供 Axum HTTP 服务和 Tauri `rpc_call` 使用，业务数据由同一组 Rust stores 管理。

Next.js 提供开发页面和生产静态资源。桌面业务逻辑、任务自动化、ACP 会话与持久化应在 Rust 运行面实现。

### 代码入口

| 路径 | 职责 |
|---|---|
| `src/app/` | 页面、布局与页面级组合 |
| `src/client/` | 组件、hooks、客户端状态与 API 调用 |
| `src/i18n/` | 翻译字典、类型与上下文 |
| `src/core/` | TypeScript 领域实现与协议辅助代码；是否参与桌面运行须沿调用链确认 |
| `apps/desktop/src-tauri/src/lib.rs` | Tauri 初始化、内嵌服务、IPC 与启动错误处理 |
| `apps/desktop/src-tauri/src/pty.rs` | 本地交互式终端 |
| `crates/routa-server/src/lib.rs` | 服务创建、静态资源与动态页面回退 |
| `crates/routa-server/src/api/` | Axum 路由与请求处理 |
| `crates/routa-server/src/application/` | 应用层任务与会话服务 |
| `crates/routa-core/src/` | 模型、stores、数据库、ACP、RPC、事件与工作流 |
| `crates/routa-scanner/` | 代码扫描 |
| `resources/specialists/` | Specialist 定义 |
| `resources/flows/` | 工作流定义 |
| `scripts/` | 构建、维护与验证脚本 |

## 2. Workspace 与数据

Workspace 是任务、看板、会话、codebase、worktree、笔记和产物的协调边界。一个 Workspace 可关联多个 codebase；codebase 保存本地仓库路径等信息，worktree 关联具体 Workspace 和 codebase。

新增功能应显式传递 `workspaceId`，并明确 codebase、任务与仓库路径的归属。启动时会确保 `default` Workspace 存在，但不能据此为新业务路径引入隐式全局作用域。

### SQLite

数据库路径由 `apps/desktop/src-tauri/src/lib.rs` 的 `resolve_db_path()` 决定：

1. `ROUTA_DB_PATH`；
2. Tauri 应用数据目录下的 `routa.db`；
3. 无法取得应用数据目录时回退到用户目录的 `.routa/routa.db`。

`crates/routa-core/src/db/mod.rs` 使用 rusqlite，开启 WAL 与外键约束，打开数据库时初始化表并执行增量迁移。异步数据库访问通过 `spawn_blocking` 执行。

修改持久化结构时，应同步修改初始化、迁移、模型和 store，并验证已有数据库可继续打开。不要把尚未实现的数据库版本管理或备份恢复能力写成现有保证。

会话历史和 trace 还涉及本地文件；排查历史缺失时需要同时检查数据库、会话持久化与文件存储链路。

## 3. API 与前端

Rust 路由注册入口是 `crates/routa-server/src/api/mod.rs`。REST 使用 `/api/*`；Agent 工具通过 MCP 调用；本机 Agent 执行使用 ACP；前端增量更新使用 SSE；Tauri IPC 负责需要直接进入宿主进程的操作。

前端统一使用：

- `resolveApiPath()`：`src/client/config/backend.ts`，补全 `/api` 前缀与 backend base URL。
- `desktopAwareFetch()`：`src/client/utils/diagnostics.ts`，处理桌面静态环境下的请求地址。

不要新增直接的 `fetch('/api/...')`。SSE 等连接同样需要正确解析 backend 地址。

backend 配置优先级为 URL 的 `backend` 参数、本地存储、`NEXT_PUBLIC_ROUTA_BACKEND_BASE_URL`。查询参数中的有效地址会保存到本地存储。

修改接口时按 `method + path` 核对路由、请求/响应类型、调用方与 `api-contract.yaml`。桌面所需接口必须在 Rust 路由中可达，不能只实现 Next.js handler。保留的 Next.js route 不会进入静态导出，也不能作为生产桌面 API 可用性的依据。

## 4. Kanban 与 Agent 执行

### 列与任务状态

卡片位置由 `columnId` 表示，`status` 是列 stage 对应的任务状态投影。默认流程为：

```text
backlog -> todo -> dev -> review -> done
                         ↘ blocked
```

产品创建流程从 backlog 开始。列是否启动 Agent、使用哪个 Provider/Specialist，以及如何推进，由看板列 automation 配置决定。

正常推进链路是：

```text
创建或移动卡片
    -> Rust 更新列与任务状态
    -> 应用列 automation 配置
    -> 创建并持久化 Agent 会话
    -> Agent 执行任务并调用 move_card
    -> Rust 检查转换条件并触发下一列 automation
```

不能仅凭 Agent 的会话完成事件假定卡片已经移动；应核对 `move_card`、任务持久化结果与目标列会话。

### 主要实现

- `crates/routa-server/src/api/tasks/`：任务 REST，按 handlers、DTO、evidence、changes 拆分。
- `crates/routa-server/src/api/tasks_automation.rs`：REST 路径的 Agent 启动、prompt 与 worktree 创建辅助。
- `crates/routa-core/src/rpc/methods/kanban/cards.rs`：RPC/MCP 卡片创建与移动。
- `crates/routa-core/src/rpc/methods/kanban/automation.rs`：列转换检查、automation 默认值、Agent 启动与 lane session 记录。
- `crates/routa-server/src/api/kanban.rs`：看板 API、配置及事件订阅。

列转换可能检查任务字段、产物、清单、人工批准与 gate command。修改转换规则时，应同时核对 REST 和 RPC/MCP 入口，保证服务端约束一致，不能只依赖 UI 或 Specialist prompt。

### 仓库与 worktree

任务必须明确关联本地仓库。RPC Kanban 自动化当前按以下顺序解析 Agent cwd：

1. 任务关联 worktree 的非空路径；
2. 任务 `codebase_ids` 中的非空仓库路径；
3. Workspace 默认 codebase；
4. Workspace 第一个具有非空路径的 codebase；
5. 进程当前目录，无法获取时为 `.`。

这段解析不等同于完整的目录有效性验证。新增执行路径应明确解析并校验仓库归属与 cwd，避免依赖进程启动目录。

任务 REST handler 在特定进入 Dev 的路径调用 `auto_create_worktree()`；RPC `move_card` 不统一执行该逻辑。因此，进入 Dev 并不保证自动创建独立 worktree。修改该行为时应统一转换路径、失败处理与 `worktree_id` 持久化。

同一仓库目录的写入任务应串行执行；需要并行时使用独立 worktree，或明确保证修改范围不重叠。看板并发配置不能替代文件隔离。

### Provider 与 ACP

`crates/routa-core/src/acp/` 管理 Provider 发现、可执行文件解析、会话、子进程和协议适配。Provider 输出归一化后再用于会话历史、trace 和 UI 更新。

本机 Agent 通过子进程 stdin/stdout 使用 ACP JSON-RPC，主要方法包括 `initialize`、`session/new`、`session/load`、`session/prompt` 和 `session/cancel`。

Codex 的 provider 别名解析到 `codex-acp`，可通过 `CODEX_ACP_BIN` 指定 adapter。adapter 与底层 Agent runtime 是不同依赖，安装、认证和版本兼容须分别验证。入口能打印版本不代表 ACP 会话能够实际完成。

修改生命周期时，应覆盖创建、prompt、取消、异常退出、超时、持久化和子进程清理，避免把请求返回等同于任务成功。

## 5. 开发环境

开发需要 Node.js、pnpm、Rust/Cargo、Tauri 平台构建依赖、Git，以及要调试的 Agent CLI 和认证配置。

根 `package.json` 固定 `pnpm@9.15.9`。从仓库根目录安装与启动：

```bash
pnpm install
pnpm tauri:dev
```

桌面 workspace 包为 `apps/desktop`。依赖树与 lockfile 使用 pnpm 管理。

| 运行部分 | 地址 | 职责 |
|---|---|---|
| Next.js dev server | `http://localhost:3110` | 开发页面与资源 |
| Tauri 内嵌 Axum | `http://127.0.0.1:3210` | API、SSE、ACP、MCP 与 SQLite 业务运行时 |

Tauri `devUrl` 带有 `runtime=tauri` 和 `backend=http://127.0.0.1:3210`，使开发页面连接 Rust API。启动导航会保留带有效 backend 提示的开发页面；生产静态入口则导航到本地 Rust 服务。

Rust 服务创建 `AppState` 并成功监听后才返回启动成功；失败时显示包含 API 地址和数据库路径的启动错误页。

常用配置：

| 环境变量 | 用途 |
|---|---|
| `ROUTA_DB_PATH` | SQLite 文件路径 |
| `ROUTA_DESKTOP_API_HOST` | 本地 API 监听地址，默认 `127.0.0.1` |
| `ROUTA_DESKTOP_API_PORT` | 本地 API 端口，默认 `3210` |
| `ROUTA_DESKTOP_API_URL` | 桌面导航的 API URL |
| `NEXT_PUBLIC_ROUTA_BACKEND_BASE_URL` | 前端 backend base URL |
| `ROUTA_RUST_BACKEND_URL` | Next.js 开发请求的 `/api/*` 代理目标 |

修改 API 地址时同步核对 Tauri `devUrl` 的 backend 参数，不能只改监听端口。

### 版本与 Cargo

Tauri 直接依赖使用精确版本。当前 JS API/CLI 为 `2.10.1`，Rust `tauri` 为 `2.10.2`；插件两侧保持 major/minor 对齐。实际约束以两个桌面 manifest 为准。

桌面 crate 属于根 Cargo workspace，Cargo 命令统一在仓库根目录执行，依赖解析使用根 `Cargo.lock`。桌面构建脚本使用 `--locked`。

## 6. 构建与交付

当前 macOS 交付目标为 Apple Silicon，交付整个 `.app` bundle。

```bash
pnpm tauri:build
```

构建链路：

```text
Tauri beforeBuildCommand
    -> scripts/prepare-frontend.mjs
    -> pnpm run build:static
    -> out/
    -> 复制静态资源到 apps/desktop/src-tauri/frontend/
    -> 准备附加打包资源
    -> Rust 编译与 Tauri app 打包
    -> target/release/bundle/macos/Routa Desktop.app/
```

`build-static.mjs` 暂时移开 API 与 `.well-known` 路由，清理生成目录，以 `ROUTA_BUILD_STATIC=1` 执行 Next.js 静态构建，最后恢复路由。执行期间不要同时启动另一个依赖这些目录的构建。

`tauri.conf.json` 的 bundle target 为 `app`，`frontendDist` 指向 `out/`，附带静态前端与 Specialist 等资源。必须复制完整 `Routa Desktop.app`；`target/release/routa-desktop` 仅是裸可执行文件。

构建与测试职责分开：构建脚本执行静态资源生成、编译与打包；测试按改动范围单独运行。`pnpm run build:static` 只生成前端，`pnpm run build:desktop` 也不生成 Tauri app。

最终用户需要 Git、可运行并完成认证的本地 Agent，以及任务仓库的读写与执行权限。桌面主程序的 Rust 服务和 SQLite 随应用运行；Provider 自身的依赖必须单独准备或由应用管理。

## 7. 开发与验证要求

- UI 文案通过 `src/i18n/` 的翻译系统提供，使用 `t('key')`。
- 行为复杂的组件采用编排入口与领域 hooks；API 按工作流分支拆分，避免把业务逻辑堆入通用 utils。
- 大规模行为重构前，用特征测试锁定路由、生命周期、持久化和恢复行为。
- 任务或会话行为变更应验证成功路径、边界输入、错误状态和 Workspace 归属。
- 调试结束移除临时日志；手工截图、录像和生成文件放在忽略目录。

按变更范围选择验证命令：

```bash
pnpm exec eslint <修改的前端文件>
pnpm exec vitest run <相关测试文件>
cargo check -p routa-desktop
cargo test -p routa-core <测试过滤条件>
cargo test -p routa-server <测试过滤条件>
```

以上带尖括号的内容需替换为实际文件或测试名称。验证记录应区分静态检查、自动化测试与实际桌面运行，不把源码推断写成已完成的运行验证。

排查桌面页面或 API 问题时，先确认请求目标、Rust 启动日志、数据库路径和实际响应；动态页面回退检查 `crates/routa-server/src/lib.rs` 与静态导出的 placeholder 页面。看板加载需要区分等待、失败和空数据，不能只凭首屏空状态判断接口不存在。


## 8. 已知问题

以下问题已通过源码核对，尚未修复。TypeScript 执行路径的问题与 Rust 桌面主链路分别记录，不能混同其运行范围。

### BUG-001：TypeScript 后台任务没有绑定任务仓库

**现象与根因**：`src/core/models/background-task.ts` 的后台任务模型未保存任务对应的仓库路径、codebase 或 worktree 绑定；`src/app/workspace/[workspaceId]/bg-tasks-tab.tsx` 创建任务时也未贯通该上下文。`src/core/background-worker/index.ts` 的 `BackgroundTaskWorker` 创建 ACP session 时使用 `cwd: process.cwd()`。

**触发条件与影响**：在 Workspace 登记 `/tmp/project-a`，从 Routa 仓库目录启动 Node 服务，并让后台任务进入该 Worker 调度路径。Agent 收到的 cwd 是服务启动目录，而不是 `/tmp/project-a`；多个 codebase 的任务也无法按目标仓库区分。这是 TypeScript Worker 路径的问题，不代表 Rust Kanban 使用该 Worker。

**修复方向**：任务创建时绑定明确的仓库路径，或可解析到仓库的 codebase/worktree 标识；模型、持久化、重试、恢复和工作流任务必须保留该绑定。Worker 只能使用任务解析并验证后的路径，缺少路径时拒绝执行并记录失败。增加测试断言 ACP `session/new` 的 cwd 等于任务绑定仓库。

### BUG-002：TypeScript LocalWorker 使用进程当前目录启动 Agent

**现象与根因**：`src/core/worker/local-worker.ts` 的 `LocalWorker.execute()` 使用 `const cwd = process.cwd()`，并将其传给 `createSession`、`createClaudeSession` 和 `createWorkspaceAgentSession`。

**影响范围**：当前源码未找到 `new LocalWorker()` 的调用方，因此该问题位于尚未接入的执行路径。若接入而不修正 cwd，Agent 会在 Routa 进程目录执行，无法遵循任务指定的仓库。

**修复方向**：Worker 执行输入必须携带已验证的仓库路径；路径缺失、不可读或不是目录时拒绝启动。增加测试验证三种会话创建分支均使用任务路径，且非法路径不会启动 Agent。

### BUG-003：Rust Kanban 无法解析仓库时使用进程当前目录

**现象与根因**：`crates/routa-core/src/rpc/methods/kanban/automation.rs` 的 `resolve_task_session_cwd()` 在 worktree、任务 codebase、Workspace 默认 codebase 和其他 codebase 都无法提供路径时，仍返回 `std::env::current_dir()`，最终可回退为 `.`。

**触发条件与影响**：任务没有 worktree/codebase 绑定，Workspace 也没有 codebase，随后触发 RPC Kanban 自动化。Agent 会在 Rust 服务当前目录启动，将缺少仓库上下文伪装成有效执行，可能修改错误项目。

**修复方向**：路径解析失败时返回明确错误，要求任务关联 codebase 或 worktree。增加缺少仓库绑定的失败测试，断言不会创建 Agent 会话；同时保留显式仓库和 worktree 路径的成功用例。

### BUG-004：Skill 已迁移到 Rust，但 ACP prompt 的解析与注入不完整

**现象与根因**：Rust 已在 `crates/routa-core/src/skills/mod.rs` 实现 Skill 发现与加载，并通过 `crates/routa-server/src/api/skills.rs` 提供按名称及仓库路径查询。前端 `src/client/acp-client.ts` 仍向 `session/prompt` 发送 `skillName` 和 `skillContent`，但 `crates/routa-server/src/api/acp_routes.rs` 未读取这两个字段，也未按名称解析 Skill，因此这部分上下文没有传给 Agent。

**迁移历史**：原 TypeScript `src/core/acp/session-prompt.ts` 在请求提供 `skillName` 且未提供 `skillContent` 时调用 `resolveSkillContent()`，并将内容传入相关 SDK adapter。提交 `01e3746`（仅保留 Rust 后端）删除了这条调用链；提交 `7e75fa0` 重新引入 `src/core/skills/skill-resolver.ts` 和测试，但未恢复业务调用方。当前该 TypeScript resolver 没有业务调用，不代表 Rust 已接入相同行为。

**触发条件与影响**：首页选择 Skill 后创建会话时，`use-session-page-bootstrap.ts` 若成功加载 Skill，会发送普通 prompt 文本及独立的 Skill 上下文字段；Rust 忽略这些字段，导致所选 Skill 内容丢失。直接调用 API 仅提供 `skillName` 时，同样不会解析或注入。聊天面板 `src/client/components/chat-panel.tsx` 已将加载的 Skill 内容拼入 prompt 文本，因此该路径仍可通过前端兜底生效。

**修复方向**：后续在 Rust `session/prompt` 中接入显式 `skillContent` 和按 `skillName` 解析的处理，明确仓库上下文及注入规则，避免与前端已拼接的内容重复。增加首页创建会话、直接 API 调用和聊天面板路径的回归测试。

**验证状态**：以上结论来自源码与 Git 历史核对，尚未运行复现。本次仅记录问题，暂不修复。
