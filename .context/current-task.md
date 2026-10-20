# 当前任务：删除 FEATURE_TREE 生成器死代码

## 目标与边界

删除仓库内 FEATURE_TREE 索引生成器及仅为它服务的死代码。本任务只做定点删除，不扩展为 FEATURE_TREE 消费端或旧后端清理。

- 不修改文档；文档由其他工程师处理。本文件仅记录本次实施范围。
- 不修改索引读取器、解析器、上下文预加载、MCP 工具或其他消费者。
- 不修改 API 契约、历史产物或 FEATURE_TREE 索引文件。
- 保留专家框架规格资源与 MCP 契约，包括 `feature_tree_spec_resource_contract.rs`、`feature-tree-spec-resource-contract.ts` 及其资源。
- 不清理历史 Next.js 代码，不将其视为当前 Tauri/Rust 产品运行入口。
- 不重构或重命名无关模块，不删除仍被其他功能使用的依赖。

## 代码调查结论

- 两个脚本入口 `scripts/docs/feature-tree-generator.ts` 和 `scripts/docs/framework-feature-tree-generator.ts` 都生成 FEATURE_TREE 索引产物；共享实现位于 `src/core/spec/feature-tree-generator.ts`。
- 当前 Tauri/Rust 路由和命令没有调用这些生成器。`crates/routa-server/src/feature_tree.rs` 是未接入路由/命令的旧模块；其中代码会启动 Node 执行生成脚本，但仓库内没有模块外调用点。
- `src/core/spec/feature-tree-cli.ts` 没有调用方，并尝试启动当前项目已不存在的 `routa` / `routa-cli`；它是过时的生成器代码，不是当前产品中的 TS CLI。
- `scripts/prepare-frontend.mjs` 仍会用 esbuild 生成 `feature-tree-generator.mjs`，而 Tauri 配置仍包含相应资源 glob。该构建产物没有当前产品调用方。
- Rust 模块由 `routa-server` 公开导出；删除时一并移除导出。仓库内 Tauri 应用没有使用者，本次按仓库产品代码范围处理。

## 实施清单

### 删除生成器及专属测试

- 删除 `scripts/docs/feature-tree-generator.ts`。
- 删除 `scripts/docs/framework-feature-tree-generator.ts`。
- 删除 `src/core/spec/feature-tree-generator.ts`。
- 删除失效且无调用方的 `src/core/spec/feature-tree-cli.ts`。
- 删除上述生成器对应测试：
  - `scripts/__tests__/feature-tree-generator.test.ts`
  - `scripts/__tests__/framework-feature-tree-generator.test.ts`
  - `src/core/spec/__tests__/feature-tree-generator.test.ts`
- 删除 `crates/routa-server/src/feature_tree.rs`，其中内嵌的专属测试随文件删除。
- 从 `crates/routa-server/src/lib.rs` 移除 `pub mod feature_tree;`。

### 删除仅服务生成器的 Tauri 构建接线

- 从 `scripts/prepare-frontend.mjs` 删除 feature-tree bundle 的路径常量、esbuild import 和生成步骤。
- 保留该脚本其余静态前端构建/复制逻辑。
- 从 `apps/desktop/src-tauri/tauri.conf.json` 删除 `bundled/feature-tree/**/*` 资源项。
- 从 `apps/desktop/src-tauri/src/lib.rs` 删除设置 `ROUTA_FEATURE_TREE_RESOURCE_DIR` 的代码；保留相邻的 specialist resource 设置。
- 删除当前工作区中由该步骤生成、且被 `.gitignore` 忽略的 `apps/desktop/src-tauri/bundled/feature-tree/feature-tree-generator.mjs`。不要删除目录中的其他文件。

## 明确保留

- `src/core/spec/feature-tree-parser.ts`、`feature-surface-index.ts`、`feature-surface-metadata.ts` 及其测试；它们属于读取/解析路径，不是生成器实现。
- 仍可能被旧 TypeScript 层引用的索引上下文与 MCP 工具；它们不在本次死代码删除范围内。
- `resources/specialists/specs/feature-tree/`、专家规格合同及相关 MCP 工具。
- `esbuild` 与 `tempfile` 依赖：桌面 bundle 的其他步骤及 Rust API 仍会使用它们。
- `.gitignore` 规则、`FEATURE_TREE.md`、`feature-tree.index.json` 和其他生成/文档产物。

## 验收与验证

- 检查剩余源码没有引用被删除的生成器函数、Rust 模块、`ROUTA_FEATURE_TREE_RESOURCE_DIR` 或 `bundled/feature-tree/feature-tree-generator.mjs` 路径。
- 检查 `prepare-frontend.mjs` 仍保留原静态前端准备流程，且不再创建 feature-tree bundle。
- 执行 `cargo check -p routa-server` 和 TypeScript 类型检查。
- 运行保留的索引读取/解析及上下文测试，确认未误删消费者代码。
- 如果运行 Tauri 构建，确认安装包资源列表不含 feature-tree generator，并确认构建不会重新生成该 mjs。
- 删除生成器专属测试；不为被删除实现保留替代测试。
- 汇报实际执行的检查和结果，不将静态搜索表述为构建验证。
