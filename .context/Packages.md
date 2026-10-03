# 依赖清理调查报告（2026-10-03）

本文记录在大规模功能清理（删除 Harness / Settings / Team / Session / tools / routa-cli / harness-monitor 等，约 -198k 行）之后，对 npm 依赖的重新核查结果。

调查方法：`knip --include dependencies` 扫描 + 逐项 grep 人工验证（排除 knip 对字符串解析类依赖的误报）。

## 1. 确认无引用，可删除

### 1.1 root `package.json` dependencies

| 依赖 | 依据 |
|---|---|
| `@ag-ui/core`、`@ag-ui/encoder` | 全仓零 import |
| `@anthropic-ai/sdk` | 零 import；`@ai-sdk/anthropic`、`@anthropic-ai/claude-agent-sdk` 仍在用，保留 |
| `@chenglou/pretext` | 零 import |
| `@codemirror/autocomplete` / `commands` / `lint` / `search` | `src/client/components/codemirror/code-viewer.tsx` 只用 `view` / `state` / `language` / `lang-*` |
| `@dnd-kit/sortable`、`@dnd-kit/utilities` | 仅 `@dnd-kit/core` 在用（Kanban 拖拽） |
| `@lezer/highlight` | 仅作 codemirror 传递依赖，无直接引用 |
| `eventsource` | `src/client/hooks/use-notes.ts` 用的是浏览器原生 `EventSource`，npm 包仅是 Node polyfill |
| `hast-util-to-html` | 零 import；`hast-util-to-jsx-runtime` 仍在用，保留 |
| `recharts` | 图表 UI 已随 Settings 删除 |

### 1.2 图表全家桶（可一并移除）

- `@xyflow/react`
- `dagre`
- `@types/dagre`

依据：唯一使用者 `src/client/utils/graph-converter.ts` 是死文件（全仓无 import），且需同时删除 `src/app/globals.css:2` 的 `@import "@xyflow/react/dist/style.css"` 和死文件本身。

### 1.3 `apps/desktop/package.json`（8 项全删）

- `@tauri-apps/api`
- `@tauri-apps/plugin-dialog` / `plugin-fs` / `plugin-notification` / `plugin-os` / `plugin-process` / `plugin-shell` / `plugin-sql`

依据：前端只通过 `window.__TAURI__` 全局对象调用（见 `src/client/utils/diagnostics.ts`），插件注册全部在 Rust 侧 `apps/desktop/src-tauri/Cargo.toml`（tauri-plugin-shell/dialog/fs/...），npm 侧零引用。

### 1.4 devDependencies

| 依赖 | 依据 |
|---|---|
| `@docusaurus/preset-classic` | `docusaurus.config.*` 已在清理中删除，docs 站点构建链路已断 |
| `@easyops-cn/docusaurus-search-local` | 同上 |
| `@eslint/eslintrc` | `eslint.config.mjs` 已不再使用 FlatCompat |
| `eslint-config-next` | `eslint.config.mjs` 直连 `@next/eslint-plugin-next`；**注意**：该插件目前是 `eslint-config-next` 的传递依赖，删除前需先把 `@next/eslint-plugin-next` 显式加入 devDependencies |
| `@testing-library/jest-dom` | `vitest.setup.ts` 未引入 |
| `@types/eventsource` | 随 `eventsource` 一并删除 |
| `@types/uuid` | uuid v13 自带类型 |
| `@types/node-cron` | node-cron v4 自带类型 |
| `patch-package` | 无 `patches/` 目录、无 postinstall 脚本 |

Docusaurus 相关连带清理：`@docusaurus/core`（devDependencies）与 `docs:dev` / `docs:build` / `docs:serve` 脚本（`scripts/build/build-docs-site.mjs` 引用的站点配置已不存在，整条链路已失效）。

## 2. 保留但需注意

| 依赖 | 说明 |
|---|---|
| `sharp` | 代码零引用，但 Next.js 生产环境图片优化需要；仅确认不使用 `next/image` 时才可删除 |
| `opencode-ai`（optionalDependencies） | 零引用，可删；注意 `@opencode-ai/sdk` 在 `src/core/acp/opencode-sdk-adapter.ts` 有使用，必须保留 |
| `@types/adm-zip` | 保留：`adm-zip` 不自带类型，`src/core/github/github-workspace.ts` 依赖其类型 |

## 3. 已验证仍在使用（勿删）

- `@agentclientprotocol/sdk`（`src/core/acp/routa-acp-agent.ts`、`next.config.ts`）
- `@ai-sdk/anthropic`、`@anthropic-ai/claude-agent-sdk`
- `@dnd-kit/core`（Kanban 拖拽）
- `@codemirror/view` / `state` / `language` / `lang-javascript` / `lang-python` / `lang-json` / `lang-html` / `lang-css`
- `hast-util-to-jsx-runtime`（`src/client/components/code-block.tsx`）
- `node-cron`（`src/core/scheduling/`）
- `uuid`、`adm-zip`、`node-pty`、`better-sqlite3`
- `@pierre/diffs`（`kanban-diff-preview.tsx`）
- `@a2a-js/sdk`（`src/core/a2a/a2a-executor.ts`）
- `@opencode-ai/sdk`（`src/core/acp/opencode-sdk-adapter.ts`）
- `sucrase`（`src/client/canvas-runtime/compiler.ts`）
- `minimatch`（`src/core/harness/`）

## 4. 执行建议

删除上述依赖后执行验证：

```bash
pnpm install
pnpm lint
pnpm build
```

若同时删除图表全家桶，先移除死文件 `src/client/utils/graph-converter.ts` 与 `globals.css` 中的 xyflow 样式 import，再卸载对应包。

---

# Rust 依赖分析（2026-10-03）

调查方法：`cargo-machete`（v0.9.2，含 `--with-metadata` 复核）+ 逐项 grep 验证（排除宏/构建脚本类误报）。

## 5. 整 crate 级死代码

| crate | 依据 |
|---|---|
| `crates/trace-parser` | 唯一引用是 `crates/routa-server/Cargo.toml` 中的依赖声明，但 routa-server 源码零使用（`rg trace_parser` 全仓无代码命中）；TS scripts 也无引用 |
| `crates/feature-trace` | 唯一使用者是 trace-parser 自身；若删除 trace-parser，此 crate 随之全死 |

两者均在 workspace members 中（root `Cargo.toml`），移除时需同步删 members 条目。

## 6. 确认无引用，可删除

### 6.1 `crates/routa-core/Cargo.toml`

| 依赖 | 依据 |
|---|---|
| `agent-client-protocol` | 全仓（crates/apps）零 `agent_client_protocol` 引用；ACP 协议已收敛到 TS 侧（`@agentclientprotocol/sdk`） |
| `async-stream` | routa-core 源码零 `async_stream` / `stream!` 宏使用（routa-server 在用，保留那边） |
| `tokio-stream` | routa-core 零引用；routa-server 在用（SSE 流），保留那边 |
| `schemars` | 无 `JsonSchema` derive、无 `schemars::` 引用；`#[tool]` 宏的 schema 生成由 rmcp 自己的 `schemars` feature 提供（rmcp 的 feature 声明保留，只删直接依赖） |

### 6.2 `crates/routa-server/Cargo.toml`

| 依赖 | 依据 |
|---|---|
| `sha2` | 源码零 `sha2::` / `Sha256` 引用（模板漂移校验和逻辑在 routa-core） |
| `trace-parser` | 见上，crate 级死链 |
| dev-dependencies 中的 `reqwest` | 与正式 dependencies 重复声明（同一版本），正式依赖在测试中已可见，可删 dev 条目 |

### 6.3 `apps/desktop/src-tauri/Cargo.toml`

| 依赖 | 依据 |
|---|---|
| `tauri-runtime` | 源码零直接引用；`tauri::Wry`（tray.rs）是 tauri 主 crate 的 re-export |
| `tauri-runtime-wry` | 同上 |

注意：这两个 `=2.10.0` 精确版本可能是当初为锁 webview 运行时统一版本而显式声明的。tauri `=2.10.2` 自身会拉起匹配的 runtime crates，删除直接依赖后由 tauri 的版本约束接管解析。删除后务必 `cargo build` 验证 Tauri 构建不受影响。

## 7. machete 误报（保留，勿删）

| 依赖 | 依据 |
|---|---|
| `tauri-build`（desktop） | `--with-metadata` 模式下误报；实际由 `build.rs` 的 `tauri_build::build()` 使用 |

## 8. 其他发现

- **sha2 版本漂移**：routa-core 用 `sha2 = "0.11"`，routa-server（未用）与 entrix 用 `"0.10"`，同一 workspace 存在两个大版本。删除 routa-server 的死条目后，建议将 entrix 对齐到统一版本。
- **desktop dev-dependencies**：`axum` / `tower` / `tower-http` / `reqwest` 在 `src-tauri/tests/api_test.rs` 有实际使用，保留。
- **routa-core 可选 feature `axum`**：由 routa-server 以 `features = ["axum"]` 启用，在用，保留。
- 其余 crate（entrix、routa-rpc、routa-scanner、trace-parser 自身、feature-trace 自身）的依赖 machete 均未报未使用；`routa-rpc` 仅依赖 routa-core，是 JS bindgen 目标，保留。

## 9. Rust 清理执行建议

```bash
# 1. 删除依赖后先做快速检查
cargo check --workspace

# 2. 涉及 desktop runtime 依赖删除时，完整构建验证
cargo build -p routa-desktop

# 3. 若删除 trace-parser / feature-trace 两个 crate：
#    - 从根 Cargo.toml workspace.members 移除条目
#    - 删除 crates/trace-parser、crates/feature-trace 目录
#    - 移除 routa-server 对 trace-parser 的依赖
cargo test --workspace
```
