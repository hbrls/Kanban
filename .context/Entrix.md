# Entrix 调查报告（2026-10-03）

本文记录对 `crates/entrix` 及其在仓库内调用面的调查结果，用于支撑后续「删除 entrix」的决策。**本文仅为调查，不含任何实施动作，仓库未做任何修改。**

调查方法：三个方向的全仓 grep（Rust / TS-JS / 文档提示词）+ 逐文件读取确认，搜索范围排除 `.kilo/worktrees/**`、`target/**`、`.next/**`、`node_modules/**` 这些陈旧副本与构建产物。

## 1. entrix 是什么

`crates/entrix` 是 Rust crate（约 1.47 万行），产物二进制名为 `entrix`，自述为 evolutionary architecture fitness function engine，即原 Python `tools/entrix` 的 Rust 重写（`crates/entrix/src/lib.rs`）。三种能力合在一处：

1. **CLI**（`crates/entrix/src/main.rs`）：`run` / `validate` / `install` / `init` / `serve` / `analyze`（long-file、file-length）/ `release-trigger` / `review-trigger` / `hook` / `graph`（build、stats、impact、test-radius、query、history、test-mapping、review-context）。
2. **Fitness 执行与评分**：`runner.rs`、`scoring.rs`、`governance.rs`、`sarif.rs`、`reporting.rs`，跑 repo metric、按 dimension 加权打分、输出 text/JSON/SARIF。
3. **代码图 + 评审上下文**：`review_context/` 用 tree-sitter 解析 Rust/TS/Java/Go/Python，算 blast radius、test radius。
4. **MCP server**：`server.rs` 用 `rmcp` 暴露 `run_fitness`、`get_dimension_status`、`analyze_change_impact`，经 `serve` 以 stdio 启动。

## 2. 真实调用面

### 2.1 Rust 侧：唯一活调用点

- **没有**任何其他 crate 把 entrix 当库依赖；`Cargo.lock` 中只有它自身的 `name = "entrix"` 条目。根 `Cargo.toml:10` 只是把它列为 workspace member。
- 唯一真正执行 entrix 二进制的活代码：
  - `crates/routa-server/src/api/review.rs:437` —— `load_graph_review_context()` 调用
  - `crates/routa-server/src/api/review.rs:449` —— `entrix_command()`，优先 `target/debug/entrix(.exe)`，否则退回 `cargo run -q -p entrix --`
  - 执行命令：`entrix graph review-context --base <base> --json`，服务 `POST /api/review/analyze`（`crates/routa-server/src/api/review.rs:26` 定义 route，`crates/routa-server/src/api/mod.rs:75` nest 到 `/api/review`）
- 该调用**本身是容错的**：`graph_review_context` 类型为 `Option<serde_json::Value>`（`review.rs:62`），进程启动失败、非零退出、JSON 解析失败都返回 `None`；响应字段带 `#[serde(skip_serializing_if = "Option::is_none")]`。因此 entrix 不存在时接口照常工作，只是缺少 graph 上下文。
- 该返回值只作为不透明 JSON 透传给 LLM review worker（`review.rs:262` 的 `build_worker_prompt`），Rust 侧不解构其内部结构。

### 2.2 TS/JS 侧：entrix 引用全部为死代码

前提：当前唯一后端是 Rust，`src/app/api/` 下已**没有** review / fitness 路由（对应能力由 `crates/routa-server` 承担）。据此逐条核对，TS 中的 entrix 引用分三类：

**(a) 死代码——全仓唯一 importer 是它自己的测试**

| 文件 | entrix 用法 | 证据 |
|---|---|---|
| `src/core/fitness/entrix-runner.ts` | `executeEntrixRun()` 按 `entrix_binary` → `cargo_runner` 顺序 spawn `entrix` 或 `cargo run -q -p entrix` | 唯一 importer 是 `src/core/fitness/__tests__/entrix-runner.test.ts:8` |
| `src/core/fitness/entrix-run-types.ts` | 纯类型（`EntrixRun*`） | 唯一 importer 是 `entrix-runner.ts:13` 与该测试 |
| `src/core/github/ci-red-fixer.ts:38` | `DEFENSE_JOB_COMMANDS` 硬编码 `entrix run --tier normal --scope ci ...` | 唯一 importer 是 `src/core/github/__tests__/ci-red-fixer.test.ts:11` |
| `src/core/review/review-analysis.ts:134` | `safeExecSync("entrix", ["graph","review-context",...])` | 见下 |

`src/core/review/` **整个目录外部零 importer**，是旧 TS 版 review 流水线残留：`review-analysis.ts`、`review-worker-prompts.ts`、`review-analysis-types.ts`、`historical-related-files.ts`、`multi-phase-review.ts`。其中 `review-analysis.ts` 只被「间接」指向——`review-worker-prompts.ts:1` import 的是 `review-analysis-types`，而非 `review-analysis.ts`；`multi-phase-review.ts` 只有自己的测试引用。

**(b) 活代码中仅剩残留 token，不是调用**

- `src/core/trace/run-outcome.ts:103`：`const FITNESS_KEYWORDS = ["entrix", "fitness", "contract", "api:test", "api:check"];`（用于 `:331`、`:369` 的日志信号分类）。该文件是**活的**，被 `src/core/orchestration/orchestrator.ts:48` 与 `src/core/trace/trace-playbook.ts:5` 引用。删除 entrix crate 不影响其运行，只是 `"entrix"` 这个关键词永远匹配不到。

**(c) 看似相关、实则与 entrix 无关（不应改动）**

- `src/core/fitness/repo-root.ts`：被 `src/core/harness/context-resolution.ts:3` 引用；后者又被 `src/app/api/harness/shared.ts:1`、`src/app/api/acp/acp-session-create.ts:37`、`src/core/harness/task-adaptive-tool.ts:5` 引用，是活的。它只读取 `docs/fitness/harness-fluency.model.yaml` 做 repo 识别。
- `src/core/webhooks/github-webhook-handler.ts`：被 `src/core/polling/github-polling-adapter.ts:25` 引用，读取 `docs/fitness/review-triggers.yaml`，属于 GitHub PR review trigger 功能，与 entrix 无关。

### 2.3 非代码引用（本次不处理）

以下引用属于文档、提示词与发布配置，按约定另行统一处理，此处仅登记：

- 根 `Cargo.toml:10`（workspace member）
- `packages/entrix/`、`scripts/release/stage-entrix-npm.mjs`、`scripts/release/sync-release-version.mjs:72/136/145`（npm 分发链，登记但不列入本轮）
- `resources/specialists/tools/harness-fitness-optimizer.yaml` 及两个 locale 副本（整份为 entrix 专属）
- `resources/specialists/{team/code-reviewer.yaml, workflows/kanban/review-guard.yaml, workflows/kanban/dev-executor.yaml, workflows/kanban/workflow.yaml}`（仅在 file-budget 规则处提及 entrix / `docs/fitness/file_budgets.json`）
- `README.md`、`README.zh-CN.md`、`AGENTS.md`、`USE-KANBAN.md`、`api-contract.yaml`（fitness 端点）、`docs/**`、`architecture/quantums.yaml` 的 `tools_fitness` 量子、`.context/Fitness.md` 等

## 3. 删除 entrix 的最小影响面

1. 删除 `crates/entrix/` 整目录。
2. 根 `Cargo.toml:10` 移除 `"crates/entrix",`，重新生成 `Cargo.lock`。
3. `crates/routa-server/src/api/review.rs`：删除 `load_graph_review_context`（`:436`）与 `entrix_command`（`:449`），将 `graph_review_context` 置 `None`（或连同字段声明 `:62` 与赋值 `:333` 一并移除）。`POST /api/review/analyze` 无需删除。

除此外 Rust 侧零影响——没有其他 crate 依赖 entrix。

## 4. 表外提示（超出 entrix 范围，供判断）

- `src/core/github/index.ts` 这个 barrel，连同它导出的 `github-workspace` / `github-pr-comment` / `review-trigger-pr-review`，在 `src/app`、`apps`、`scripts` 中均未发现 importer（按 `@/core/github` 与相对路径两种写法查过）。可能整条 GitHub TS 链也已被 Rust 取代，但这不是 entrix 的事。
- `postgres`/`sha2` 等版本漂移见 `.context/Packages.md`。

## 5. 结论

- entrix 在仓库中的真实耦合面极小：Rust 侧只有 `routa-server` 一处、且已容错；TS 侧的 entrix 调用点全部位于无生产 importer 的死代码中。
- 删除 `crates/entrix` 的代码改动是「删一个 crate + 改一个 Rust 文件的两段小函数 + 重新生成 lock」。
- `.kilo/worktrees/tulip-verdict/` 下同名文件是陈旧 worktree 副本，不是消费者。
