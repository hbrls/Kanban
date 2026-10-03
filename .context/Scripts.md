# Scripts

## 调查结论

`scripts/` 是仓库级工具脚本目录，负责开发辅助、构建、桌面打包、文档生成、质量检查、维护、诊断和发布流程。它不是 Routa 的业务运行时目录，也不是 Tauri 应用启动后承载 Kanban、Dispatcher、LocalWorker 或 Rust API 的模块集合。

脚本通常通过根目录 `package.json` 的 `scripts` 字段作为命令入口执行，运行时使用 Node.js、TypeScript/`tsx`、Python 或 shell。`scripts/package.json` 只声明该目录使用 ES module 语义：

```json
{
  "type": "module"
}
```

## 当前桌面构建链路

正式桌面交付使用 Tauri 构建。Tauri 配置中的 `beforeBuildCommand` 指向 `scripts/prepare-frontend.mjs`：

```text
pnpm tauri:build
  -> apps/desktop/src-tauri/tauri.conf.json
  -> node ../../scripts/prepare-frontend.mjs
  -> pnpm run build:static
  -> Next.js 静态导出到 out/
  -> 复制 out/ 到 apps/desktop/src-tauri/frontend/
  -> 打包 feature-tree generator
  -> Tauri 编译并生成 .app
```

### `scripts/prepare-frontend.mjs`

这是 Tauri 打包前的跨平台准备脚本，主要步骤如下：

1. 执行 `pnpm run build:static`。
2. 删除旧的 `apps/desktop/src-tauri/frontend/`。
3. 将根目录 `out/` 复制到 Tauri 的 `frontend/` 目录。
4. 使用 esbuild 将 `scripts/docs/feature-tree-generator.ts` 打包到 `apps/desktop/src-tauri/bundled/feature-tree/`。

该脚本替代了过去写在 Tauri 配置中的 Unix 专用 `rm -rf` 和 `cp -r` 命令，因此也适用于 Windows 开发环境。

### `scripts/build/build-static.mjs`

该脚本生成 Tauri 所需的 Next.js 静态前端。由于 Next.js 静态导出不能同时包含需要服务器运行的 API 路由，它会：

- 临时移动 `src/app/api/` 和 `src/app/.well-known/`；
- 清理旧的 `.next/`、`.next-page-snapshots/` 和 `out/`；
- 执行 Next.js build，并设置 `ROUTA_BUILD_STATIC=1`；
- 无论构建成功还是失败，都恢复被临时移动的目录。

它只负责生成静态资源，不启动常驻服务器。

### `scripts/build/build-desktop-bundle.mjs`

该脚本生成 `apps/desktop/src-tauri/bundled/desktop-server/`，内容来自 Next.js standalone 输出，并额外编译 SQLite 模块、复制 `better-sqlite3` 原生依赖。它对应旧的 Node/Next standalone 服务 bundle，需要本机 Node.js 才能运行。

根据 `DEVELOPMENT.md`，当前正式桌面运行面是 Tauri 内嵌 Rust/Axum + SQLite；因此该脚本属于兼容或历史构建路径，不能据此判断当前桌面应用会启动 Next.js Node Server。`pnpm tauri:build` 的正式入口仍由 Tauri 配置和 `prepare-frontend.mjs` 决定。

## 子目录职责

| 目录 | 职责 |
| --- | --- |
| `build/` | 静态前端、桌面 standalone bundle、Docker bundle、文档站构建。 |
| `docs/` | feature tree、framework feature tree 和 specialist 文档生成。 |
| `release/` | 版本同步、变更日志、发布 manifest、npm 包暂存、tarball 验证和 macOS 签名验证。 |
| `maintenance/` | SQLite 中 ACP session history 和工具调用参数增量的压缩维护。 |
| `harness/` | transcript 分析、搜索工具使用分析和任务自适应 issue 摘要。 |
| `canvas/` | Canvas SDK 源码对应的 prompt artifact 和 manifest 生成。 |
| `debug/` | Office/WASM 资源、游标画布和渲染链路的一致性检查。 |
| `lib/` | 脚本共用的路径、CLI 参数、YAML、Node 环境、OpenAPI contract 和 Agent hook 策略辅助函数。 |
| `fitness/` | API parity、OpenAPI、覆盖率、性能、可访问性和 ACP smoke check 等历史质量检查。 |
| `deprecated/` | 已废弃的桌面 shell 回归包装脚本。 |
| `regression/` | 回归脚本新增约束说明；文件内容要求优先使用 `e2e/` 中的 Playwright 测试。 |
| `__tests__/` | 对 scripts 中工具函数和 CLI 行为的 Vitest 测试。 |

## 顶层脚本

### Agent 和 Git 控制面检查

- `check-tool-permission.js`：读取 hook 输入，检查工具调用是否尝试修改受保护的 Git 或 Agent 控制面文件。
- `check-prompt-policy.js`：检查用户提示是否包含受阻断的控制面修改操作。
- `check-git-control-plane.js`：检查 Git hooks、hooks path 和本地 Git 身份配置。
- `lib/agent-hook-policy.js`、`lib/git-control-plane-doctor.js`：提供上述检查共用的策略和诊断逻辑。

这些脚本保护的是仓库控制面，不是 Routa 业务 API。

### 页面快照和设计检查

- `generate-snapshots.mjs`、`page-snapshot-lib.mjs`、`page-snapshot-fixtures.mjs`：生成和验证页面快照。
- `lint-design-system-css.mjs`：检查设计系统 CSS、品牌语义和颜色系统。
- `validate-storybook-governance.mjs`：检查 Storybook 配置、文档标签和必需 story。

### 其他工具

- `mcp-http-proxy.mjs`：把 Claude Code 支持的 stdio MCP 传输桥接到 Routa 的 Streamable HTTP MCP endpoint。
- `coauthor-stats.ts`：统计 Git 提交中的 co-author 工具和模型信息。
- `debug-task-changes-perf.ts`：分析任务 changes 接口的性能。

## `fitness/` 的当前定位

`DEVELOPMENT.md` 已说明 Fitness 功能从当前开发和交付范围删除，历史背景保留在 `.context/Fitness.md`。`scripts/fitness/` 目录仍存在，并且根 `package.json` 仍保留若干 `api:check`、`api:schema:*`、`test:performance` 和 coverage 命令。

因此这些脚本应视为仓库中保留的历史或兼容检查工具。它们可以用于明确的调查或验证，但不能被解释为当前 Tauri Kanban 运行时、Rust Task Automation 或正式桌面交付的必要组件。新增功能也不应因为目录仍存在就重新依赖 Fitness。

## 入口命令

脚本的实际使用方式以根目录 `package.json` 为准，常见入口包括：

```bash
pnpm build:static
pnpm tauri:build
pnpm build:desktop
pnpm docs:build
pnpm release:prepare
pnpm scripts:test
pnpm lint:css
```

其中：

- `pnpm tauri:build` 是当前 Tauri 桌面交付入口；
- `pnpm build:static` 只生成静态前端；
- `pnpm build:desktop` 会组合旧的 standalone bundle 和静态构建，不等同于生成 Tauri `.app`；
- `pnpm scripts:test` 只测试 `scripts/__tests__/` 中的脚本逻辑。

## 运行边界

最终桌面应用的业务运行链路仍然是：

```text
Tauri
  -> 静态前端资源
  -> 内嵌 Rust/Axum + SQLite
  -> Dispatcher
  -> LocalWorker
  -> 本机 Agent
```

`scripts/` 主要在开发、构建、检查、维护和发布阶段被调用；它不是上述链路中的 Dispatcher 或 Worker 实现。脚本目录中存在的 Next.js standalone、Docker、Playwright 或 Fitness 工具，也不能改变 `DEVELOPMENT.md` 规定的当前 Rust-only 桌面交付边界。

## 调查范围与注意事项

本报告记录的是对 `scripts/` 目录结构、根 `package.json` 命令、Tauri 配置和关键脚本注释的静态调查。调查过程中未修改 `scripts/` 下的任何文件。写入本报告前，仓库中已有若干 `scripts/` 文件处于未提交修改状态，这些修改不属于本调查。
