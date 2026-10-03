# Harness 控制台

> **最终状态（2026-10-02）**：以下前半部分保留的是 Harness 清理前的功能调查和删除边界，不能当作当前 UI 清单。Harness Overview、Harness 导航入口及独立 Harness UI 已完成移除；本文件末尾的“最终清理记录”是当前状态和有意保留范围的准确信息。

## 功能定位

Harness 是 Routa 面向当前 Workspace/代码库的仓库治理控制台，入口为：

```text
/settings/harness?workspaceId=<workspaceId>
```

它不是 Agent Provider、聊天窗口、终端或 Kanban 看板，也不是一个单独的模型执行器。它把影响 AI Coding 交付的上下文、约束、反馈和流程配置集中到一个工作台中，用于回答：

- Agent 应该知道哪些规范和设计决策？
- Agent 或仓库流程允许做什么、何时必须阻断？
- 仓库实际提供哪些测试、构建、Hook 和 CI 信号？
- 变更凭什么可以进入评审、发布或下一阶段？

左侧桌面导航将 Harness 链接到 `/settings/harness`，并在存在 Workspace 时传递 `workspaceId`。实现见 `src/client/components/desktop-sidebar.tsx`。

## 控制台结构

当前 Harness Console 采用类似 IDE 的工作台布局：

- 左侧 Explorer：按四组展示子菜单。
- 顶部 Tabs：打开多个子菜单，并通过 `section` 查询参数保持当前页面。
- 主内容区：显示当前仓库的扫描、配置和治理结果。
- Overview 底部面板：可切换 `Context`、`Execution Plan`、`Fitness`。
- 页面数据根据 Workspace、Codebase 和选中的本地仓库路径加载。

实现入口是 `src/app/settings/harness/page.tsx`，核心控制台在 `src/app/settings/harness/harness-console-page.tsx`。

## 四组子功能

### Overview / 概览

Overview 有两个视图：

- `Lifecycle`：把思考、编码、构建、测试、评审、发布等阶段串成治理生命周期。
- `Loop`：展示从上下文、执行、观察到评估/交付的治理闭环。

点击生命周期节点后可以在底部查看对应 Context，或者打开该节点对应的完整子菜单。Overview 主要承担导航和关联关系展示，不是单独的 Agent 运行入口。

### Intent：意图与约束

#### Spec

`Intent - Spec` 实际是只读的本地问题关系看板，将仓库中的 `docs/issues/*.md` 展示成可筛选、可查看关联关系的界面。它不是规范生成器、Spec Sources 扫描器或 Kanban 任务管理功能。

##### 界面与操作

界面主要包含：

- 状态看板：按 `open`、`investigating`、`resolved`、`wontfix` 分列；
- 问题关系浏览器：展示关联问题形成的问题簇、所属领域、未解决数量和处理进度；
- 详情面板：展示 Markdown 正文、严重程度、日期、报告人、标签、GitHub 链接、引用和反向引用、同簇问题及关联页面/API。

用户可以按状态、类型、严重程度和领域筛选，点击问题或关联项查看详情。虽然界面形似看板，但不能拖动卡片、修改状态、创建 Kanban 任务或启动 Agent。

##### 两个入口，同一个面板

当前源码有两个入口：

```text
Harness 嵌入入口：/settings/harness?workspaceId=<id>&section=spec
独立页面路由：/workspace/<id>/spec
```

两者复用同一个 `SpecBoardPanel`，不是两套功能：

- Harness 在主内容区嵌入面板；
- 独立路由由 `SpecPageClient` 将面板放在 `DesktopAppShell` 中整页展示，并提供 Workspace 切换。

当前桌面侧栏没有独立 Spec 菜单。这里的“独立 Spec 工作台”仅指源码中保留的独立页面路由，不代表另有一项日常界面可点击的产品功能；更准确的称呼是“同一 Spec 看板的独立页面路由”。路由存在也不等于已经完成实际桌面访问验证。

实现文件：

- `src/app/settings/harness/harness-console-page.tsx`：Harness 嵌入入口；
- `src/app/workspace/[workspaceId]/spec/page.tsx`：独立页面路由和静态构建 placeholder；
- `src/app/workspace/[workspaceId]/spec/spec-page-client.tsx`：`SpecBoardPanel`、`SpecPageClient` 和交互；
- `src/app/workspace/[workspaceId]/spec/spec-board-model.ts`：问题关系、分组和产品表面匹配。

##### 数据来源与读取链路

面板挂载或 Workspace 变化时，通过 `resolveApiPath` 和 `desktopAwareFetch` 并行请求：

| 接口 | 数据来源与作用 |
| --- | --- |
| `GET /api/spec/issues` | 读取仓库 `docs/issues` 中的 Markdown，解析 YAML frontmatter 和正文 |
| `GET /api/spec/surface-index` | 读取 `docs/product-specs/feature-tree.index.json` 和 `api-contract.yaml`，返回页面与 API 索引 |

两个接口由 `crates/routa-server/src/api/spec.rs` 提供，并在 Rust API router 中注册到 `/api/spec`。

问题接口读取当前目录内的 Markdown 文件，不递归扫描子目录；跳过 `_template.md`、缺失 frontmatter 或 YAML 无法解析的文件。状态、严重程度、关联项和 GitHub 信息来自文件字段，不读取 Kanban 任务数据库；`closed` 会归一为 `resolved`，未知状态按 `open` 处理。

GitHub 信息只是本地文件记录，面板不会实时查询或同步 GitHub。两个接口均为只读，没有修改问题或状态的写入接口。问题文件变化后，重新加载面板才会读取新内容；当前没有自动轮询或文件变化订阅。

Spec 面板只传入 `workspaceId`，由后端解析仓库根目录，没有使用 Harness RepoPicker 的独立仓库选择；Harness 选中 Spec 时也会隐藏该 RepoPicker。不能将它描述成扫描 Harness 当前任意选定本地路径的功能。

##### 谁计算关联、置信度和进度

数据加载后，前端 `buildSpecBoardModel()` 按确定性规则计算：

- 根据 `related_issues` 解析本地、GitHub 或外部关联，以及反向引用；
- 将关联图中的连通问题归为同一个问题簇；
- 从问题标题、正文中的文件路径、页面路由、API 路径，以及 area/tags 提取匹配证据；
- 对页面/API 匹配结果按固定权重计算分数和 `high` / `medium` / `low` 置信度；
- 根据问题状态统计未解决数量和处理进度，其中 `open` / `investigating` 算未解决。

这些计算不是 AI 评审或 Fitness 评分，也不代表代码已经修复或验证通过。页面显示的状态本身仍由 Markdown 字段决定。

##### 与 Kanban 的边界及删除范围含义

当前搜索没有发现 Kanban 直接复用 `SpecBoardPanel` 或调用上述两个 Spec API。不能把此看板解释成 Kanban 的核心模块，也不能因为它有状态列就套用 Kanban automation、任务流转和数据库语义。

但底层 Feature Tree 生成/索引、上下文检索、MCP 资源，以及协作文档中的 `spec` 类型是其他能力，不属于这个问题看板。历史 TypeScript Kanban 的 Feature Tree 调用不能作为当前 Rust-only 桌面依赖 Spec UI 的证据；Rust 编排同样有独立的 Feature Tree 规范资源能力，应按实际消费者保留。

后续删除需要区分两个范围：

- 仅删除 Harness 的 `Intent - Spec`：清理 Console 的菜单、section、URL 识别和嵌入逻辑，不能据此删除仍被独立路由使用的面板和 API；
- 删除整个 Spec 问题看板：还涉及独立页面路由、面板、关系模型、两个专属 API、i18n 和相关测试，需另行明确，不因清理 Harness 入口就自动扩大范围。

无论哪个范围，都不删除 `docs/issues`、Feature Tree 索引/规范或 `api-contract.yaml` 的实际内容，不按 `spec` 名称批量删除共享代码。本节是功能调查记录，不代表已经实施删除。

#### Spec Sources / 规范来源

这是 Harness 中的只读“规范来源发现与预览”面板，回答“当前选定仓库使用哪些规范工具或方法，相关文件在哪里”。它不是规范编辑器、规范执行器，也不是 Kanban 任务工作台。

独立菜单入口为：

```text
/settings/harness?workspaceId=<workspaceId>&section=spec-sources
```

##### 扫描和展示内容

检测器根据仓库中的目录、文件和配置证据识别以下来源：

- Kiro；
- Qoder；
- OpenSpec；
- Spec Kit；
- BMAD；
- 上述工具/框架的集成目录。

面板按 Native Tools、Frameworks、Integrations、Legacy 分组，支持展开/收起来源、展开 Kiro feature tree，以及点击 Preview 查看文件内容。展示数据包括：

- 来源类别：`native-tool`、`framework`、`tool-integration`；
- 检测置信度：`high`、`medium`、`low`；
- 来源状态：`artifacts-present`、`installed-only`、`archived`、`legacy`；
- 来源根路径、检测证据和文件数量；
- 文件类型，例如 requirements、design、tasks、bugfix、proposal、plan、PRD、architecture、epic、story、context、config；
- Kiro feature 的文件列表，以及 `.config.kiro` 中的 `specId`、`workflowType`、`specType`；
- 扫描 warning 和未发现来源的空状态。

置信度和文件类型是检测器按目录结构、文件名及配置证据推断的分类，不是 AI 评审结论，也不是规范质量或 Fitness 分数。

##### 数据来源与触发时间

当前调用链为：

```text
Harness 页面挂载或仓库上下文变化
  -> useHarnessSettingsData
  -> GET /api/harness/spec-sources
  -> Rust/Axum get_spec_sources
  -> resolve_repo_root
  -> routa_core::spec_detector::detect_spec_sources
  -> 扫描仓库文件/目录并生成报告
  -> UI 展示来源、证据和文件列表
```

`useHarnessSettingsData` 在具备 Workspace、Codebase 或 repoPath 上下文时加载数据，并在上下文变化后重新请求；它不只在选中 Spec Sources 菜单时才加载。返回报告包含 `generatedAt`、`repoRoot`、`sources` 和 `warnings`，前端会将缺失的数组字段规范化为空数组。

`GET` 是只读，但不是单纯读取已保存结果：Rust handler 每次请求都会调用检测器进行扫描、分类并生成报告。该链路不写入规范、不执行规范、不运行 Agent，也不计算 Fitness 分数；不依赖 Entrix binary。

相关实现：

- `src/client/components/harness-spec-sources-panel.tsx`：完整和 compact 面板；
- `src/client/hooks/use-harness-settings-data.ts`：请求、状态和响应 normalizer；
- `crates/routa-server/src/api/harness.rs`：`/api/harness/spec-sources` route 和 handler；
- `crates/routa-core/src/spec_detector.rs`：Rust 检测器、报告类型和检测测试。

##### 文件预览与桌面运行边界

点击 Preview 时，面板请求：

```text
GET /api/harness/spec-sources/file?filePath=<path>&workspaceId=<id>&codebaseId=<id>&repoPath=<path>
```

该接口读取指定仓库中的文件并返回 `{ content, filePath }`，不是规范生成或修改接口。当前发现的实现为 `src/app/api/harness/spec-sources/file/route.ts`，测试位于 `src/app/api/harness/spec-sources/__tests__/file-route.test.ts`；全仓搜索发现的生产调用方是 Spec Sources 面板。

预览 route 属于历史 Next.js 运行面，与 Rust `/spec-sources` 扫描接口不是同一个 endpoint。按 `DEVELOPMENT.md`，当前正式桌面交付不启用 Next.js Node Server，因此源码中存在预览按钮和 Next route 不等于该预览接口在 Rust-only 桌面运行面可用；本次调查未确认对应的 Rust 预览 handler。

##### Overview 隐式入口

Spec Sources 不只存在于左侧 Intent 菜单：

- `harness-console-page.tsx` 将治理图的 `thinking` 节点映射到 `spec-sources`；
- Overview Lifecycle 的 thinking/需求定义节点可以打开底部 Context 中的 compact `HarnessSpecSourcesPanel`；
- Governance Loop 的 thinking 详情介绍 Spec Sources、规范框架和 evidence model；
- 菜单状态显示检测到的来源数量。

删除独立菜单时需要同时清理这些 Spec Sources 专属入口、详情和请求，不能只移除左侧按钮。Overview 本身也是未来删除目标，不要求为这些入口保留长期兼容。

##### 共享能力与删除边界

Rust detector 并非 Harness UI 专属。`crates/routa-cli/src/commands/harness/engineering/mod.rs` 直接调用 `detect_spec_sources(repo_root)`，将报告用于工程评估、规范摘要和缺失规范来源的 gap 分类；CLI 不依赖 UI 的 HTTP endpoint。

因此独立 Harness 删除范围可以涉及菜单、section、面板、hook 中的 Spec Sources 状态/请求、Overview compact 入口、专属 i18n 和测试，以及确认无其他消费者后的扫描/预览 UI API，但不能据此删除：

- `crates/routa-core/src/spec_detector.rs`、Rust 报告类型和 detector 测试；
- Harness Engineering CLI 的规范来源检测和 gap 分类；
- 仓库实际的 `.kiro`、`.qoder`、OpenSpec、Spec Kit、BMAD 规范和配置文件；
- 独立 Spec 工作台、Kanban、Workflow、Specialist 等其他能力。

仓库还保留 `src/core/harness/spec-detector.ts` 和 `spec-detector-types.ts`。当前搜索只发现 TypeScript detector 函数由其测试调用，而响应类型仍被 Harness 面板和 hook 使用；实施时应重新确认引用及 `DEVELOPMENT.md` 对保留 `src/core/**` 的约束，不能直接将这一套底层实现视为菜单专属删除项。

以上是功能调查和边界记录，不代表已经实施删除。本系列只清理代码，不因移除 UI 修改 `docs/**`、`api-contract.yaml` 或产品索引；本次按明确要求更新本调查文件。

#### Agent Instructions / Agent 指令

读取仓库的 Agent 指令文件，例如 `CLAUDE.md` 等，并按以下方向进行审计：

- routing：任务和职责如何路由；
- protection：禁止项、权限边界和升级条件；
- reflection：失败后的分析和策略切换；
- verification：完成前必须执行的客观检查。

该面板可以重新运行指令审计；审计结果可能是通过、启发式通过或错误。

#### Design Decisions / 设计决策

这是 Harness Intent 组中的只读架构决策展示功能。它扫描当前仓库并展示：

- `docs/ARCHITECTURE.md`（同时兼容大小写变体和历史拼写变体）；
- `docs/adr/*.md`；
- 架构文档/ADR 的摘要、状态、置信度和 Code References；
- 文档缺失、ADR 标题无法识别等 warning。

它不会写入文档，不执行检查，也不计算质量分数。当前主要入口是：

```text
/settings/harness?workspaceId=<workspaceId>&section=design-decisions
```

前端面板和数据链路：

- `src/client/components/harness-design-decision-panel.tsx`：完整页面和 Overview compact 面板；
- `src/client/hooks/use-harness-settings-data.ts`：请求并规范化设计决策数据；
- `GET /api/harness/design-decisions`：按 Workspace、Codebase 或 repoPath 扫描仓库。

当前 `/api/harness/design-decisions` 没有独立的 Next.js route，实际由
`crates/routa-server/src/api/harness.rs` 的 Rust/Axum router 提供。Rust handler 会读取仓库文件，构造 Architecture/ADR report，并返回 JSON。

仓库中还存在一套未被生产代码引用的重复 TypeScript 实现：

- `src/core/harness/design-decision-loader.ts`；
- `src/core/harness/design-decision-types.ts`。

它们只服务这项已存在的 Harness 概念，删除实现时应先做全仓 import 确认后一起移除。

#### Design Decisions 的隐式入口

该功能不只存在于左侧菜单：

- `harness-console-page.tsx` 将治理图的 `coding` 节点映射到 `design-decisions` section，并在底部 Context 面板显示 compact 设计决策面板；
- `harness-lifecycle-view.tsx` 使用“设计决策”节点和 `designDecisionNodeEnabled` 控制热点是否可点击；
- `public/harness-lifecycle-view.svg` 静态绘制了“设计决策 / Canonical / ADR / 1 + 6 ADRs”卡片；
- `harness-governance-loop-graph.tsx` 生成 coding 节点、`thinking -> coding -> build` 边、coding 详情和 ADR 不可用提示。

因此删除菜单时不能只移除左侧按钮。否则 Overview 会留下可见的设计决策卡片、不可点击节点或继续发起 API 请求。

#### 删除边界

应删除：

- Harness Design Decisions section、菜单、section URL 入口和状态徽标；
- `HarnessDesignDecisionPanel`、对应类型、normalizer、hook state 和 API 请求；
- Rust `/api/harness/design-decisions` route、handler 及专属 Markdown/ADR parser；
- Overview Lifecycle/Loop 中的设计决策节点、边、详情、SVG 卡片和相关 i18n；
- 仅被该功能使用的测试 mock、fixture、E2E route stub 和孤立 TypeScript loader/types。

旧 URL `?section=design-decisions` 不保留兼容页，应按未知 section 回退到 Overview。

必须保留：

- `docs/ARCHITECTURE.md` 和 `docs/adr/` 文件及其内容；
- `src/core/harness/spec-detector.ts` 对 architecture 文档的通用来源识别；
- 其他 Harness、Kanban、Fitness、Entrix、Hook Runtime 和工作流能力。

本系列清理只处理代码；不因删除 UI 而删除架构文档，也不修改 `docs/**`、`api-contract.yaml` 或产品索引文档。后续全仓搜索若在这些文档中看到旧接口描述，属于按约束保留的文档残留。

### Control：控制与门禁

#### Hook Systems / Hook 系统

合并展示两类 Hook：

- Runtime Hook：构建、测试、提交等阶段的运行配置和命令；
- Agent Hook：Agent 生命周期事件触发的命令、URL 或 Prompt，以及超时和阻塞属性。

该页面主要用于检查 Hook 是否被发现、如何触发以及是否会阻断流程。

#### Review Triggers / 评审触发器

展示由变更路径、证据路径、边界、目录、文件/行数阈值等条件触发的评审规则，并显示评审动作、严重级别和 Specialist/Provider 路由。

#### Release Triggers / 发布触发器

展示发布面治理规则，例如暴露面、漂移、边界、能力和体积增长等维度，以及匹配的路径、模式和阈值。

#### CODEOWNERS

解析仓库的 CODEOWNERS，报告：

- 未归属文件；
- 多个规则重叠匹配的文件；
- 敏感路径缺少 Owner 的情况。

### Flow：流程与自动化

#### Automations / 清理与纠错

读取仓库中的自动化定义，展示：

- 触发来源：finding、schedule、review signal 或 external event；
- 执行目标：Specialist、Workflow 或后台任务；
- 运行状态：active、paused、pending、definition-only、idle 等；
- 待处理的清理或纠错信号、严重级别和时间窗口。

该页面偏向运行状态和配置诊断，不是通用的自动化编辑器。

#### CI/CD

读取 GitHub Actions 工作流，展示工作流事件、Job、Job 依赖、审批和发布阶段，用于理解 CI/CD 的流程拓扑和配置状态。它不是 GitHub Actions 执行器的替代品。

### Signal：仓库反馈与质量信号

#### Architecture Quality / 架构质量

运行或刷新架构扫描，检查后端模块边界和循环依赖，显示失败规则、违规数量，并可与上一次扫描快照比较。

#### Repository Signals / Test Feedback / 测试反馈

这个名称容易误导。`repo-signals` 不是测试执行器，也不是 CI/测试结果反馈面板；它是一个**仓库结构信号发现器**。

它观察的是当前选中仓库自身暴露出来的证据：

- `package.json` 中的 scripts；
- `pnpm-lock.yaml`、`package-lock.json`、`yarn.lock` 等 lockfile；
- `vitest.config.ts`、`playwright.config.ts` 等测试配置；
- `coverage`、`test-results`、`docs/fitness/reports` 等产物目录；
- `docs/harness/test.yml` 中声明的文件检查规则和脚本匹配规则。

因此这里的 “repo signal” 是“仓库的信号”，不是某个用户、CI 服务或测试框架发来的信号。检测器根据文件是否存在、脚本名称是否匹配正则，推断仓库是否暴露了 Unit、E2E、Contract/Quality、Coverage 等测试入口。

当前面板流程是：

```text
选择仓库
  -> GET /api/harness/repo-signals
  -> resolve_repo_root
  -> 读取 package.json 和 docs/harness/test.yml
  -> 检查文件并匹配 scripts
  -> 返回 build/test surface report
  -> UI 展示配置证据、脚本入口、变体和警告
```

它不会执行 `pnpm test`、`cargo test` 或 Playwright，也不会展示 pass/fail、覆盖率数值、断言错误、耗时、CI 结果或 Fitness 分数。更准确的产品名称应是 `Test Surface` 或 `Test Signals`；`Test Feedback` 只是当前 `docs/harness/test.yml` 和 i18n 使用的显示名称。

当前有两个 Harness 入口：

- 左侧 Signal 菜单的 `repo-signals` 完整页面；
- Governance Loop 的 `test` 节点打开的 compact 上下文面板。

实现与依赖：

- `src/client/components/harness-repo-signals-panel.tsx`：前端面板，请求 `/api/harness/repo-signals`；
- `crates/routa-server/src/api/harness.rs`：注册 Rust/Axum route；
- `crates/routa-server/src/api/harness_repo_views.rs`：解析仓库上下文并返回报告；
- `crates/routa-core/src/harness.rs`：共享的 build/test surface 检测器；
- `crates/routa-cli/src/commands/harness.rs` 和 `engineering/`：CLI `harness detect` 与工程报告也使用同一个 Rust detector。

所以删除 `SIGNAL - Test Feedback` 时可以删除 Harness UI、compact 入口和 UI API，但不能仅因为菜单被删除就删除 Rust core detector、Harness CLI 或 `docs/harness/build.yml` / `docs/harness/test.yml`。

#### Entrix Fitness

展示仓库中的 Fitness 规范文件、质量维度、指标、Runner、tier、hard gate 和执行计划。指标可能使用 shell、graph 或 SARIF 等 Runner，并会显示适用范围和变更触发条件。

## 推荐使用顺序

对一个新仓库进行接入或排查时，可以按以下顺序使用：

1. 确认顶部 Workspace、Codebase 和本地仓库路径正确。
2. 在 Overview 中查看 Lifecycle/Loop，确定当前治理链路。
3. 在 Intent 组确认规范来源、Agent 指令和设计决策。
4. 在 Control 组检查 Hook、评审触发器、发布触发器和 CODEOWNERS。
5. 在 Signal 组确认测试反馈、架构扫描和质量指标。
6. 在 Flow 组检查自动化定义和 CI/CD 工作流。
7. 回到 Kanban 执行任务；Harness 提供的是任务执行的上下文、约束和证据，不负责取代 Kanban 的任务流。

## 与其他功能的边界

| 功能 | 主要问题 |
| --- | --- |
| Kanban | 任务处于哪个阶段、由谁处理、下一步是什么 |
| Harness | 仓库允许怎样处理、需要哪些规则和证据才能继续 |
| Traces | Agent 实际执行了什么、改了哪些文件、运行了哪些命令 |
| Harness Monitor | 独立的 Rust CLI/TUI 监控组件，关注运行观察、归因、评估和证据 |

左下角菜单是 Web/Tauri 内的 Harness Console；`crates/harness-monitor/` 是另一个运行面。两者使用相近的治理概念，但不是同一个 UI 或进程。

## 当前状态与注意事项

### Fitness 状态存在文档与源码不一致

`DEVELOPMENT.md` 和 `.context/Fitness.md` 写明旧的 Fitness 功能已经从当前开发和桌面交付范围删除；但当前 Harness Console 源码仍保留 `Entrix Fitness` 子菜单、Fitness 文件面板和执行计划组件。

因此当前应谨慎解释为：

- Harness UI 仍能展示 Entrix Fitness 相关的仓库规范和执行计划；
- 不能仅因为页面存在该菜单，就断言 Fitness 仍是生产运行中的强制门禁；
- 是否实际执行、是否会阻断任务，需要结合实际 API 调用、启动模式和运行时日志确认。

### 主要数据来源

控制台通过 Harness API 读取仓库数据，包括：

- `/api/harness/spec-sources`
- `/api/harness/instructions`
- `/api/harness/design-decisions`
- `/api/harness/repo-signals`
- `/api/harness/automations`
- `/api/harness/hooks`
- `/api/harness/codeowners`
- `/api/harness/github-actions`

桌面运行时应通过 `desktopAwareFetch` 和统一 API 路径访问 Rust/Axum 后端；不要把 Harness 页面中的配置展示误认为浏览器本地自行执行了这些治理流程。

## 相关源码与文档

- `src/client/components/desktop-sidebar.tsx`：桌面导航入口。
- `src/app/settings/harness/page.tsx`：Harness 设置路由。
- `src/app/settings/harness/harness-console-page.tsx`：Explorer、Tabs、Overview 和所有子菜单的编排。
- `src/client/hooks/use-harness-settings-data.ts`：Harness 设置数据加载和 API 调用。
- `docs/harness/harness-monitor-run-centric-operator-model.md`：Harness Monitor 的四层模型：Context、Run、Observe、Govern。
- `.context/Fitness.md`：旧 Fitness 功能背景和当前状态说明。

## 最终清理记录

### 已移除的 Harness/Fitness UI

最后一轮清理的目标是删除 Harness Overview，从而结束整个 Harness UI，而不是继续保留一个空壳入口。已纳入清理范围的独立代码包括：

- `/settings/harness` 页面、Console、导航入口和 Harness 图标；
- Lifecycle 静态图、治理 Loop 图、Execution Plan、Context/Fitness 底部面板及其专用 Hook/helper；
- Harness 专用 repo selection 存储、专用测试和无其他消费者的 UI 组件；
- Fitness HTTP API：`/api/fitness/analyze`、`/plan`、`/report`、`/runtime`、`/specs`，以及历史 Next route 测试残留；
- Kanban SSE 中的 `fitness:changed` 专用转换和刷新分支。

这些删除不等于删除 Kanban。正常 `kanban:changed`、任务状态事件、SSE 重连/清理、列自动化、Workspace 隔离和任务流转仍属于共享 Kanban 能力。

### Fitness Canvas 残留的边界

Fitness Workbench 专用的 `FitnessOverviewCanvas` 和 `fitness-ui-builder` Specialist 资源属于独立 UI，随本轮清理移除。通用 Canvas Viewer、动态 TSX Canvas、Artifact 存储、Specialist 生成和 Canvas SDK 仍保留。

仓库中仍可能出现 `fitness_overview` 类型、历史 Artifact 解析或对应测试数据。这些是兼容既有 Canvas payload 的数据模型边界，不表示 Fitness UI 入口仍存在，也不应通过删除历史用户 Artifact 来“清零”。

### Entrix 与底层 Fitness 的明确保留范围

Entrix CLI、`crates/entrix/**`、相关 workspace 依赖和发布/分发链路由另一项任务处理，本轮没有删除。以下同样不因 Harness UI 消失而批量删除：

- `routa fitness fluency`、Harness Engineering/ratchet/speed profile；
- Harness Monitor 的 Entrix evaluate、TUI、cache 和 CLI 集成；
- Review CLI 对 Entrix 的调用；
- `src/core/fitness/**` 中仍被共享代码引用的 repo-root、runner 和 runtime 类型；
- `scripts/fitness/**` 的开发质量检查；
- Task-Adaptive Harness、repo detector、context resolution 和其他共享 Harness runtime。

因此，“Harness UI 已删除”与“仓库中不再有 harness/fitness/entrix 字符串”是两个不同结论。后者不是本轮验收标准。

### Fitness 与 Entrix 的责任边界

Fitness 和 Entrix 不是同一个东西：

- Fitness 是面向仓库质量/治理结果的规范、HTTP/API 和数据展示边界；
- Entrix 是执行规则、Runner 和评分计算的 CLI/crate 运行时；
- Harness UI 只是读取或触发这些能力的一个历史入口，不是评分引擎本身。

Fitness API 的请求语义也不同：

- `GET /api/fitness/plan`、`GET /api/fitness/specs`：读取仓库中的 Fitness 配置/规范并生成计划或结构化报告，属于只读请求，但可能在请求过程中解析文件和计算返回结构；
- `GET /api/fitness/runtime`、`GET /api/fitness/report`：读取已有运行事件、快照或报告文件，不重新执行评分；
- `POST /api/fitness/analyze`（以及历史 `run` route）：才是触发 Entrix 评估、生成评分/快照和运行结果的执行入口。

历史 Harness 页面会在挂载或仓库上下文变化时自动请求 Plan；这不会因为 GET 方法就变成评分执行，也不会替代 Entrix CLI。真正的评估通常由显式 CLI/脚本/CI 或其他运行时调用触发，再由报告/运行时接口读取结果。删除 Harness UI/API 入口不会删除 Entrix 的独立执行能力。

### 代码搜索中的有意残留

最终清理后，搜索结果仍可能包含以下非 UI 项：

- Kanban 事件测试中确认 Fitness 消息被忽略的 fixture；
- Canvas 历史 `fitness_overview` 类型和读取测试；
- Feature Trace catalog 中的历史 Harness 能力描述；
- Entrix CLI、Harness Monitor、Review 和开发质量工具的实现与测试。

这些匹配不能单独作为“清理未完成”的证据。只有重新出现 Harness 页面/导航/API，或正常 Kanban 事件被 Fitness 分支劫持，才属于本轮范围内的回归。

### 文档范围

本轮只补充调查记录，不修改 `docs/**`、`DEVELOPMENT.md`、`api-contract.yaml`、产品索引、`docs/fitness` 规则、实际仓库问题/规范文件或运行时快照。前文关于各菜单功能的章节保留为历史取证，最终删除边界以本节和 `.context/current-task.md` 为准。
