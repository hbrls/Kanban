# entrix 删除方案（`crates/entrix` + `packages/entrix`）

## 目标

删除 `crates/entrix` 与 `packages/entrix` 两个组件，以及它们在源码、workspace 配置和 release 脚本中的全部引用。本轮大规模清理已删除所有业务调用方后，这两个组件已无任何可达调用方，属于整组件级死代码。

## 调查结论（删除依据）

全部结论由代码得出（`.rs` / `.ts` / `.mjs` / `Cargo.toml` / `package.json`），`docs/**`、README、AGENTS.md、`resources/specialists/**` 提示词不作证据。

### 反向依赖：零

- `cargo tree -i entrix --offline` → 仅输出 `entrix v0.19.0 (crates/entrix)` 自身。
- `Cargo.lock:1536` 是唯一 `name = "entrix"` 条目。
- 除 `crates/entrix/Cargo.toml` 自身外，**没有任何 `Cargo.toml` 出现 entrix**，也没有任何 `[workspace.dependencies]` 条目（根 `Cargo.toml` 无该 section）。
- 根 `Cargo.toml:8` 只是 workspace member 列表项。

### Rust 侧引用：一个文件的 5 行

全仓 `crates/` + `apps/` 内（排除 `crates/entrix/`）entrix 只命中 `crates/routa-server/src/api/review.rs` 的 `:437`、`:449`、`:454`、`:456`、`:462`。执行链：

```text
POST /api/review/analyze        review.rs:27 定义 route，api/mod.rs:75 nest 到 /api/review
  └─ ReviewAnalysisPayload      review.rs:62  字段 graph_review_context: Option<Value>（skip_serializing_if）
     └─ :333 赋值 ─ load_graph_review_context  :436-447
                       └─ entrix_command       :449-465
                          → target/debug/entrix(.exe)
                          → 否则 cargo run -q -p entrix --
                          → 实参 graph review-context --base <base> --json
```

该调用**已容错**：`.output().ok()?`、非零退出 `return None`、JSON 解析失败 `.ok()` 都会让字段缺席，接口仍 200。因此删除不破坏接口契约。

**仓内无调用方**：`/api/review/analyze` 在 `src/`、`apps/`、`scripts/` 中无任何构造 URL 的代码；仅有的两处字符串命中在测试 fixture 内，且指向不存在的 TS 路径 `src/app/api/review/route.ts`。

### TS 侧引用：5 个生产文件，全部不可达或为残留

| 文件 | entrix 用法 | 全仓 importer（已穷举） | 判定 |
|---|---|---|---|
| `src/core/fitness/entrix-runner.ts`（361 行） | `:236` `spawn("entrix",["run","--tier",…])`；`:241` 退回 `cargo run -q -p entrix` | 仅 `src/core/fitness/__tests__/entrix-runner.test.ts:8` | 死代码 |
| `src/core/fitness/entrix-run-types.ts`（84 行） | 纯类型 | 仅 `entrix-runner.ts:13` | 死代码 |
| `src/core/github/ci-red-fixer.ts`（169 行） | `:38` 常量内硬编码 `entrix run --tier normal --scope ci …` 字面量 | 仅自己的测试 | 死代码（另有独立死因） |
| `src/core/review/review-analysis.ts`（222 行） | `:134` `safeExecSync("entrix",["graph","review-context",…])` | 无 | 死代码（整目录不可达） |
| `src/core/trace/run-outcome.ts:103` | `FITNESS_KEYWORDS` 数组内的一个 token | 活文件（`trace-playbook.ts`、`orchestrator.ts`） | **活代码中的残留 token** |

补充证据：`executeEntrixRun`（`entrix-runner.ts:283`，唯一真正 spawn 的函数）全仓无调用者，且 `entrix-runner.test.ts` 内无 `spawn`/`exec`/`vi.mock`，只覆盖三个纯函数。

### `packages/entrix`：代码面零消费者

代码内引用仅 3 行，全在 release 脚本：`scripts/release/sync-release-version.mjs:72`（`crateNames` 数组）、`:136-138`（写 `packages/entrix/package.json`）、`:145`（写 `crates/entrix/Cargo.toml`）。

- **不在 JS workspace**：`pnpm-workspace.yaml` 只列 `apps/desktop`、`packages/office-render`；根 `package.json` 无 `workspaces` 字段。
- **不在构建链**：`scripts/build/**`、`apps/desktop/src-tauri/**` 对 entrix 零命中。
- **无 CI**：仓库不存在 `.github/`、`.gitlab-ci.yml`、`.circleci/`；`scripts/release/publish.sh` 未提及 entrix，也未调用 staging 脚本。
- **`scripts/release/stage-entrix-npm.mjs` 无调用者**，且其输入目录 `dist/entrix-artifacts`（`:58`）在全仓无生产者，手动执行也无输入。

### 关键耦合点：release 链路存在硬依赖

`package.json` 的 `release:prepare` → `scripts/release/prepare-release-artifacts.mjs:107` → `sync-release-version.mjs`。后者 `:136` 会读 `packages/entrix/package.json`。目录删除后若不删这一调用，release 脚本会因文件不存在而抛错。**这不是可选清理，必须同步修改。**

## 已确认的边界

- 本任务只处理 entrix 两个组件及其引用。`docs/**`、README、AGENTS.md、`docs/fitness/**`、`resources/specialists/**` 提示词一律不处理（另有文档工作流）。
- 不删除 `POST /api/review/analyze` 路由，不删除其请求/响应结构与其余字段。
- 不修改 `api-contract.yaml`：其 `ReviewAnalysisPayload` schema（`api-contract.yaml:76-105`）**未声明** `graph_review_context`，删除该字段不产生契约差异。
- 不处理 `src/core/review/**` 整目录（独立死代码群，与 entrix 无因果关系；其中 `review-analysis.ts:134` 的 entrix 引用随该目录一并消失）。
- 不处理 `src/core/github/ci-red-fixer.ts` 与 `src/core/github/**`（整链无生产 importer，独立死代码群）。
- 不处理 `docs/fitness/review-triggers.yaml` 中的 `graph_review_context` 触发上下文键 —— 它有独立的 TS 消费者（`src/core/github/review-trigger-pr-review.ts:92`、`src/core/harness/__tests__/codeowners.test.ts:226`），与 entrix 无关。
- 不为被删除的能力提供替代实现或兼容层。

## 删除对象

```text
crates/entrix/                          （17,722 行 Rust）
packages/entrix/                        （bin/entrix.js 90 行 + package.json + README.md）
scripts/release/stage-entrix-npm.mjs    （202 行，无调用者）
```

以及下方「修改范围与顺序」列出的源码编辑点。

## 修改范围与顺序

### 1. 先解除 `review.rs` 的调用

`crates/routa-server/src/api/review.rs`：

- 删 `:436-447` `load_graph_review_context` 函数（连同其后 `:448` 空行）。
- 删 `:449-465` `entrix_command` 函数。
- 删 `:61-62` 字段声明（`#[serde(skip_serializing_if = "Option::is_none")]` + `graph_review_context: Option<serde_json::Value>`），以及 `:333` 的赋值行 `graph_review_context: load_graph_review_context(repo_root, base),`。
- 删 `:5` `use std::process::Command;` —— 该 import 的唯一命名使用点在 `entrix_command`（`:449` 返回类型、`:459`、`:461`）；`:342`/`:396` 的 `crate::git::git_command()` 来自 `routa_core::git`（`crates/routa-server/src/lib.rs:23` re-export），不需要该 import。
- 不改 `:27` 的 route 与 `api/mod.rs:75` 的 nest。

### 2. 从 workspace 移除成员（必须早于删目录）

根 `Cargo.toml:8` 删除 `"crates/entrix",`。

### 3. 删除目录

```text
crates/entrix/
packages/entrix/
```

### 4. release 链路（含硬依赖，必须做）

`scripts/release/sync-release-version.mjs`：

- 删 `:136-138` 的 `await updateJsonVersion("packages/entrix/package.json", version, { updateOptionalDeps: true });`。
- 删 `:145` 的 `await updateTomlVersion("crates/entrix/Cargo.toml", version);`。
- `:72` 的 `crateNames` 数组移除 `"entrix"`。该模式当前**是 no-op**：它只在 `updateWorkspaceDeps: true` 时生效（仅 routa-rpc `:142`、routa-server `:144` 两次调用），而这两个 `Cargo.toml` 都不声明 entrix 依赖。

删除 `scripts/release/stage-entrix-npm.mjs`。

`scripts/release/prepare-release-artifacts.mjs`、`scripts/release/publish.sh`、根 `package.json:40` 无需改动（它们只是调用 `sync-release-version.mjs`）。

### 5. TS 侧 entrix 驱动代码

- 删 `src/core/fitness/entrix-runner.ts`、`src/core/fitness/entrix-run-types.ts`、`src/core/fitness/__tests__/entrix-runner.test.ts`（该目录仅剩 `repo-root.ts`，它是活的：被 `src/core/harness/context-resolution.ts:3` 引用，保留）。
- `src/core/trace/run-outcome.ts:103`：从 `FITNESS_KEYWORDS` 移除 `"entrix"`，保留其余四个关键词（`fitness` / `contract` / `api:test` / `api:check` 仍对应真实存在的 npm script 名）。

### 6. 重生成锁文件

`cargo metadata` 或 `cargo build` 会重写 `Cargo.lock`：移除 `:1536` entrix 记录，以及仅由它引入的 `tree-sitter` `:7007`、`tree-sitter-language` `:7041`、`tree-sitter-{go,java,python,rust,typescript}` `:7021-7067`。`rmcp` `:4723` / `rmcp-macros` `:4755` **保留**（`routa-core/Cargo.toml:33`、`routa-server/Cargo.toml:40` 也在用）。不做手工定向删除，以 cargo 重写结果为准。

## 明确不改的内容

- `POST /api/review/analyze` 路由、`ReviewAnalyzeRequest`、`ReviewAnalyzeResponse` 及其余字段。
- `api-contract.yaml`（未声明 `graph_review_context`，无需同步）。
- `src/core/review/**`、`src/core/github/**`（含 `ci-red-fixer.ts` 内的 entrix 字面量）、`src/core/fitness/repo-root.ts`。
- `src/core/trace/run-outcome.ts` 中 `FITNESS_KEYWORDS` 的其余四个关键词。
- `docs/fitness/**` 全部数据与规则文件，及其 `graph_review_context` 触发键。
- 版本号：不动 `package.json` / `Cargo.toml` 的 `0.19.0`。
- 历史 issue 与 release notes 的回写。

## 验收与验证

按以下顺序执行：

1. `cargo metadata --no-deps --format-version 1` 成功，members 中无 `crates/entrix`。
2. `cargo build -p routa-server`、`cargo build -p routa-desktop` 成功。
3. `cargo test -p routa-server` 成功。
4. `cargo tree -i entrix` 与 `cargo tree -i tree-sitter` 均报 package not found。
5. `git diff Cargo.lock` 只包含 entrix 与 `tree-sitter*` 的移除，无其他变动。
6. TS 引用扫尾，只允许命中白名单（`src/core/review/**`、`src/core/github/**`、测试 fixture 与 `.context/**`、`docs/**`）：

```bash
rg -n --hidden -g '!target' -g '!node_modules' -g '!docs' -g '!.context' 'entrix'
```

7. `pnpm lint` 与 `pnpm test:run` 通过。
8. release 链路联通性：`npm run release:sync-version -- --version 0.19.0` 后 `git diff --stat` 应为空（当前版本已是 0.19.0，脚本不应再触碰任何 entrix 路径，也不应因缺失文件报错）。
9. `node --check scripts/release/sync-release-version.mjs` 通过。

## 已知影响与风险

- **接口行为**：`/api/review/analyze` 响应中不再出现 `graphReviewContext`（camelCase 序列化）。该字段此前只在 entrix 二进制或 `cargo run -p entrix` 可用时出现，且 `api-contract.yaml` 未声明它 —— 契约不变，仅失去一个最佳努力字段。
- **能力层面**：entrix CLI 的 `run` / `validate` / `graph` 全部子命令 / `serve`（MCP）/ `release-trigger` / `review-trigger` 等能力从仓库消失。仓内无消费者；仓内唯一实际执行过的子命令是 `graph review-context`。
- **无测试覆盖的删除面**：`review.rs` 内无 `#[cfg(test)]`，`crates/routa-server/tests/**` 也无 review 端点用例 —— 该路由的行为变化没有自动化断言兜底，仅靠 §验收 第 2、3 条保证编译与整体测试通过。
- **不可逆但可恢复**：源码可从 git 历史恢复（初始导入 `5e32e67`），恢复后仍需重新接入调用方才有意义。
- **仓内无法验证的两点**：`POST /api/review/analyze` 是否存在仓外调用方；npm / crates.io 上是否仍有外部安装者（沙箱禁网，`npm view entrix` 未取得结果）。两者都不阻塞删除，但若存在仓外调用方，将失去 graph 上下文注入。
- **动态引用风险**：无。entrix 是普通 workspace member，无 proc-macro 与 `include!` 导出。

## 完成判定

只有在 workspace members、`Cargo.lock`、`review.rs` 的源码与 import、TS 侧 entrix 驱动文件、release 脚本三处编辑点中都不再存在 entrix 引用，同时 `routa-server` 与 `routa-desktop` 可正常构建、`cargo test -p routa-server` 通过、`pnpm lint` / `pnpm test:run` 通过、release 版本同步脚本可无错执行，才算完成。

`src/core/review/**`、`src/core/github/**`、`docs/fitness/**` 中残留的 entrix 字样不计入完成判定（属其他工作流范围），但必须保持不动。
