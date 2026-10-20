# Fitness

## 功能简介

Fitness 曾是 Routa 的仓库质量门禁与工程健康检查功能，由 Entrix 执行仓库级检查并生成结果。它关注代码质量、测试、Rust 构建与测试、API 契约、安全依赖、架构和 UI 一致性等工程信号，用于发现影响代码库可维护性和 Agent 自动化协作能力的问题。

Fitness 不是 Kanban 任务状态，也不是 Agent Provider 或本地后端的连通性检查。它的结果只反映一次仓库检查运行的质量信号；失败也不等同于 Kanban 本身无法使用。

## 当前状态

Fitness 功能已从当前开发和交付范围中删除。本文仅保留功能背景，不构成现行 API、运行时或质量门禁契约。

## Kanban 历史集成调查

以下内容记录 KanbanFitnessWorkbenchModal 的历史行为，便于后续删除调用方。它不表示 Fitness 仍属于 Kanban 的运行流程。

### KanbanFitnessWorkbenchModal 的职责

`KanbanFitnessWorkbenchModal` 是 Fitness 结果可视化工作台，不是普通 Kanban TaskAutomation 的执行器。打开后，它曾经：

1. 并行读取 `/api/fitness/specs`、`/api/fitness/plan`、`/api/fitness/runtime`。
2. 通过 `POST /api/fitness/run` 执行一次 Entrix Fitness 检查，参数通常是 `tier: "fast"`、`scope: "local"`。
3. 创建 `fitness-ui-builder` Specialist Session。
4. 将 Entrix 结果、Fitness spec 和 execution plan 交给 Specialist，生成单文件 TSX Canvas。
5. 编译 TSX，在左侧预览，并通过 `/api/canvas/specialist/materialize` 持久化生成的 Canvas。
6. 在右侧嵌入该 Specialist Session 的实时会话页面。

### Specialist Session 协议链路

“启动一个独立 Specialist Session”表示创建一个新的 `sessionId`，不复用当前 Kanban 任务会话，也没有 `parentSessionId`，因此它是独立的 Agent 会话。

前端不是直接调用 `AcpManager`，而是通过 ACP（Agent Client Protocol）调用 `/api/acp`：

```text
KanbanFitnessWorkbenchModal
  -> useAcp / BrowserAcpClient
  -> POST /api/acp，JSON-RPC 2.0 session/new
  -> Rust Axum acp_rpc
  -> AppState.acp_manager
  -> Provider/Agent 进程
```

创建请求的关键字段包括：

```json
{
  "method": "session/new",
  "params": {
    "cwd": "<repoPath>",
    "provider": "<preferredProvider>",
    "role": "DEVELOPER",
    "workspaceId": "<workspaceId>",
    "specialistId": "fitness-ui-builder",
    "branch": "<branch>",
    "toolMode": "full"
  }
}
```

创建完成后，再通过 ACP `session/prompt` 发送任务 Prompt。Rust 后端的 `AcpManager` 负责实际 Provider 会话和 Agent 进程的生命周期。

### Prompt 的两层结构

#### Specialist System Prompt

`specialistId` 为 `fitness-ui-builder`，对应：

`resources/specialists/tools/fitness-ui-builder.yaml`

该配置要求 Specialist：

- 只返回单文件 TSX；
- 生成浏览器安全的 Canvas；
- 数据全部内联，不使用 `window`、`document`、`fetch`、`localStorage`、定时器或副作用；
- 只能从 `react` 或 `@canvas-sdk` 导入；
- 不伪造 Fitness 分数、通过数量或文件内容；缺少数据时显示 pending/missing 状态；
- 不输出 Markdown 代码块、聊天记录、终端或全局应用壳。

后端根据 `specialistId` 加载 Specialist 配置，并把 `system_prompt` 与 `role_reminder` 组合为会话级系统 Prompt。

#### 本次任务的 User Prompt

Modal 通过 `buildKanbanFitnessWorkbenchUserPrompt` 生成用户 Prompt，再由 `buildCanvasSpecialistPrompt` 加上 Canvas 生成契约。内容包括：

- 真实的 Entrix 运行结果 `entrixRun`；
- Fitness spec 文件摘要；
- execution plan 摘要；
- 要求生成适合 Kanban 弹窗、约 1200x760 的工程工作台；
- 要求 `entrixRun.report` 作为分数和通过/失败状态的主要事实来源；
- 要求数据内联、不 fetch、不编造结果。

该 Prompt 最终通过 `session/prompt` 发送给刚创建的 Specialist Session。

### SSE 与刷新链路

这里容易把 ACP SSE 和 Canvas 预览刷新混为一谈。实际存在两条并行链路：

```text
session/new
  -> session/prompt
  -> Provider 生成 Agent 输出
  -> ACP SSE session/update
  -> 右侧嵌入的 Session 页面实时显示会话状态
```

左侧 Canvas 预览并不直接消费 SSE，而是每 2 秒轮询：

```text
GET /api/sessions/{sessionId}/history?consolidated=true
  -> 提取 Specialist 输出中的 TSX
  -> compileCanvasTsx
  -> 更新 previewSource
  -> 左侧 Canvas 重新渲染
  -> POST /api/canvas/specialist/materialize 保存
```

Fitness 检查本身也不是 SSE：`/api/fitness/run` 是打开 Modal 时执行的一次性 HTTP 请求。当前调查未发现它在后台持续执行或通过 SSE 重复推送结果。

### 调用方范围

在 Kanban 内，`KanbanFitnessWorkbenchModal` 是 Fitness 工作台和 `/api/fitness/run` 的主要生产调用方。整个应用的 Settings/Harness 页面仍可能有独立的 Fitness 入口，但它们不属于 Kanban TaskAutomation。

## Fitness 与 Entrix 的职责边界

两者不是同一个功能：

```text
Fitness
  = 规则、指标、阈值、tier、scope、hard gate 和报告模型

Entrix
  = 读取 Fitness 规则、执行 metrics、计算 score、输出运行结果的引擎
```

### Fitness

Fitness 的输入和规则主要位于目标仓库的 `docs/fitness/`：

- `manifest.yaml` 和 dimension 文件；
- metric 命令、Runner、tier 和 execution scope；
- dimension 权重；
- pass/warn 阈值；
- hard gate 配置。

Fitness 回答的是“仓库需要检查什么，以及什么结果算通过”。Fitness 不是 Kanban 状态，也不是 Agent Provider。

### Entrix

Entrix 是 Rust 实现的 Fitness 执行和评分引擎，源码位于 `crates/entrix/`，CLI 名称也是 `entrix`。典型调用为：

```bash
entrix run --tier fast --scope local --json
```

Entrix 会读取 `docs/fitness/`，选择目标 tier/scope 的 metrics，执行 metric 命令，计算 dimension score 和最终 `final_score`，判断 hard gate/最低分数是否阻断，并输出 JSON、runtime event 和 artifact。

真实评分由 `crates/entrix/src/scoring.rs` 完成：

```text
dimension score = 通过的 metric 数 / 可评分 metric 总数 * 100
final score     = 各 dimension score 按 weight 加权平均
```

`routa fitness fluency` 是另一个分析入口，用于评估 Harness Fluency/Harnessability 成熟度，不等同于 `entrix run` 的仓库 metric 执行。

## API 的计算责任和触发时机

HTTP 方法不能单独证明接口是“纯读取”。当前实现中，部分 GET 会进行解析或派生计算，`GET /api/fitness/architecture` 甚至会运行检查并写入快照。

### `GET /api/fitness/specs`

- **实现者**：Rust/Axum `get_fitness_specs`。
- **工作**：读取并解析 `docs/fitness` 文件，生成前端使用的 spec summary。
- **是否运行 metric**：否。
- **是否写入结果**：正常情况下否。
- **触发点**：Harness Console 加载、Workspace/Codebase/repoPath 变化；Kanban Fitness Workbench 打开时也会读取。

### `GET /api/fitness/plan`

- **实现者**：Rust/Axum `get_fitness_plan`。
- **工作**：解析 frontmatter，按 `tier` 和 `scope` 过滤 metrics，统计 dimension、metric、hard gate 和 Runner 数量，生成 Execution Plan。
- **是否运行 metric**：否，只计算计划。
- **是否写入结果**：否。
- **触发点**：Harness Console 初次加载、切换 `fast/normal/deep` tier、Workspace/Codebase/repoPath 变化；Kanban Fitness Workbench 打开时也会读取。

### `GET /api/fitness/runtime`

- **实现者**：Rust/Axum runtime reader。
- **工作**：读取已有的 Fitness event、artifact 和上次完成结果，汇总 `running/passed/failed/missing`、`finalScore`、hard gate 等状态。
- **是否启动检查**：否。
- **触发点**：Kanban runtime hook 初次加载、页面可见时每 5 秒轮询、手动 refresh；Fitness Workbench 打开时读取一次。
- **数据产生者**：实际 Fitness runner、Entrix 或 Harness Monitor 写入的 runtime event/artifact，而不是该 GET 接口。

### `GET /api/fitness/report`

- **实现者**：Rust/Axum。
- **工作**：读取 `docs/fitness/reports/*` 中已有的 fluency snapshot。
- **是否运行分析**：否。

### `GET /api/fitness/architecture`

- **实现者**：Rust/Axum。
- **工作**：启动 `scripts/fitness/check-backend-architecture.ts`，汇总 boundaries/cycles 结果，并写入 architecture snapshot。
- **是否纯读取**：否。它会执行检查，并可能写入 `docs/fitness/reports/backend-architecture-latest.json`。
- **触发点**：Harness Architecture Quality 面板中的“运行/刷新架构扫描”按钮。Harness 初次打开该面板时不是自动执行，只有 refresh token 被触发后才请求。

### `POST /api/fitness/analyze`

- **实现者**：Rust/Axum。
- **工作**：启动 `cargo run -p routa-cli -- fitness fluency ...`，执行 Fluency/Harnessability 分析；默认可能比较并保存快照，`noSave` 可以关闭保存。
- **是否执行分析**：是，但它是 fluency 分析，不是 `entrix run` metric 执行。
- **当前 UI 触发点**：源码中未发现 Harness 菜单直接调用该接口，主要作为独立 API/CLI 能力存在。

### `POST /api/fitness/run`

- **实现者**：当前源码中是 Next.js Node route `src/app/api/fitness/run/route.ts`。
- **工作**：调用 `executeEntrixRun`，优先启动 PATH 中的 `entrix`，找不到时 fallback 到 `cargo run -p entrix`，执行真正的 metrics 并返回 Entrix report。
- **触发点**：当前主要由 KanbanFitnessWorkbenchModal 打开时触发，通常使用 `tier: fast`、`scope: local`。
- **重要边界**：Rust/Axum 的 `crates/routa-server/src/api/fitness.rs` 当前注册了 `/analyze`、`/architecture`、`/plan`、`/report`、`/runtime`、`/specs`，没有注册 `/run`。桌面 Rust-only 模式是否能完成该 POST，需要运行时验证，不能只依据 Kanban 前端调用路径推断。

## 分数的三个含义

当前代码中“分数”至少有三种，不应混为一谈：

1. **Harness UI 雷达图分数**：浏览器根据 Fitness spec 的权重、hard gate 比例和阈值严格程度计算的展示分数，不是一次真实检查结果。
2. **Entrix `final_score`**：Entrix 执行 metrics 后，根据各 dimension 结果和权重计算的实际运行分数。
3. **Fluency/Harnessability 分数**：`routa fitness fluency` 评估仓库治理成熟度的结果，和 Entrix metric pass rate 不同。

## Entrix 待删除清单（仅方案，不在本次实施）

用户已决定将 Entrix 列入最终待删除范围。以下清单只记录删除计划，不代表本次已经删除：

### Entrix 引擎和发行物

- `crates/entrix/`：crate manifest、`src/` 全部模块、测试和 CLI 实现；
- 根 `Cargo.toml` 中的 `crates/entrix` workspace member；
- Cargo lockfile 中由该 crate 引入且不再被其他 crate 使用的依赖记录；
- `packages/entrix/`：npm launcher、平台 binary 包引用和 README；
- `scripts/release/stage-entrix-npm.mjs`；
- `scripts/release/sync-release-version.mjs` 中的 Entrix 版本同步和发布引用；
- README、release guide、fitness 文档和 issue 中仅用于 Entrix 安装/发布的说明。

### Entrix 的服务端和运行时集成

- `src/core/fitness/entrix-runner.ts` 及其类型、测试和 `POST /api/fitness/run` route；
- `crates/harness-monitor/Cargo.toml` 对 `entrix` crate 的依赖；
- `crates/harness-monitor/src/evaluate/entrix.rs` 及其直接调用、runtime cache 和 TUI fitness adapter；
- 其他通过 `Command` 启动 `entrix` 或 `cargo run -p entrix` 的 Routa server/CLI/review/harness engineering 代码；
- runtime event/artifact 中仅为 Entrix 运行结果服务的写入和读取逻辑。

### 不能随 Entrix 引擎直接删除的 Kanban 共享调用

根据“共享功能保留”的约束，以下代码在 Entrix 删除前必须先迁移、替换或明确取消 Kanban Fitness Workbench：

- `src/app/workspace/[workspaceId]/kanban/kanban-fitness-workbench-modal.tsx`；
- `src/app/workspace/[workspaceId]/kanban/kanban-fitness-workbench-prompt.ts`；
- `src/app/workspace/[workspaceId]/kanban/use-runtime-fitness-status.ts`；
- Kanban 侧对 `/api/fitness/specs`、`/api/fitness/plan`、`/api/fitness/runtime`、`/api/fitness/run` 的调用；
- Kanban 使用 `FitnessSpecSummary`、Entrix report 和 runtime status 的类型及测试。

如果 Kanban 仍需保留 Fitness 结果展示，应先将共享类型、规则读取或替代执行器迁移到独立的非-Harness模块，再删除 Entrix crate。不能因为删除 Harness 菜单，就直接删除这些 Kanban 依赖。

### Fitness API 和规则文件的后续判断

Entrix 删除后是否继续保留 `/api/fitness/specs`、`/api/fitness/plan`、`/api/fitness/runtime` 和 `docs/fitness`，取决于 Kanban 是否继续保留 Fitness 工作台：

- 如果 Kanban 保留：保留或重写共享 API，替换实际执行器；
- 如果 Kanban 也取消该工作台：再删除 Fitness API、`src/core/fitness/*`、`docs/fitness` 规则和相关测试；
- 在做出 Kanban 决定前，不删除这些共享入口。
