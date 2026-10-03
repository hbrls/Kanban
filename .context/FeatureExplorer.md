# Feature Explorer

## 功能定位

Feature Explorer（特性浏览）是 Routa 面向当前 Workspace/代码库的 Feature-first 代码理解与 Agent 历史分析工作台。入口为：

```text
/workspace/:workspaceId/feature-explorer
```

它不是运行时 Feature Flag、设置页或 Kanban 看板，而是把产品 Feature 与以下代码和运行证据关联起来：

- 能力分组和 Feature taxonomy；
- 前端页面与 URL 路由；
- API 契约，以及 Next.js/Rust 的实现来源；
- Feature 关联的源文件和文件树；
- 文件改动次数、关联会话数和最近更新时间；
- Agent 会话中的 prompt、工具调用、读取/写入文件、失败调用和重复操作；
- 已保存的 Feature/File 回顾记录和摩擦画像。

导航入口位于 `src/client/components/desktop-sidebar.tsx`，页面实现位于：

```text
src/app/workspace/[workspaceId]/feature-explorer/
```

## 数据来源与后端

Feature Explorer 以当前 Workspace 选中的本地代码库为分析范围。Feature Tree 和 Surface Index 的主要文件是：

```text
docs/product-specs/FEATURE_TREE.md
docs/product-specs/feature-tree.index.json
```

`FEATURE_TREE.md` 提供能力分组、Feature、页面、API 和源文件等人工整理的元数据；`feature-tree.index.json` 提供由扫描器生成的页面、API 和实现索引。

前端加载 Feature 列表和 Surface Index：

```text
GET /api/feature-explorer
GET /api/spec/surface-index
```

桌面 Rust 模式下，逻辑调用通过 `desktopAwareFetch` 进入本地 Rust/Axum 后端。Rust 侧会解析当前仓库的 Feature Tree，并补充 session 统计、文件统计、文件信号和页面/API Surface 关联。

如果仓库没有人工维护的 Feature taxonomy，页面可以显示根据 routes/API 自动推导的 Feature 分组。数据质量因此依赖于仓库的 Feature Tree、Surface Index 和本地 Agent transcript 是否完整。

## 顶部工具区

左侧面板顶部提供以下控制：

### 代码库选择

通过 Repo Picker 切换当前 Workspace 下的本地 codebase/repository。选择会按 Feature Explorer 的 workspace 范围保存，后续重新进入页面时恢复。

### Generate Feature Tree

打开 Feature Tree 生成抽屉，先执行仓库预检，然后生成或刷新：

- `Agent`：启动 Feature Tree specialist，显示会话和工具调用日志，再提交返回的 metadata；
- `Quick Scan`：跳过 specialist，基于仓库 routes、API 和实现文件做确定性扫描；
- `Dry Run`：只预览生成结果，不写入仓库文件。

生成结果用于更新 `FEATURE_TREE.md` 和 `feature-tree.index.json`。这是该页面会主动写入代码库文档的主要操作。

### Refresh Friction Profiles

重新计算 Feature 级和文件级摩擦画像。画像来自历史任务/Agent 会话信号，重点包括：

- 文件或 Feature 关联的会话数量；
- 重复读取文件；
- 重复命令；
- 失败的工具调用及错误信息。

画像只作为分析和提示，不会自动修改代码。

### 搜索与状态指标

搜索框可以匹配 Feature、Surface、API 路径和源文件路径。顶部指标还会显示：

- 人工整理的 Feature 数；
- 自动推导的 Feature 数；
- 文件/Feature 摩擦画像数量；
- 页面和 API 契约数量；
- Feature Index 与摩擦画像的生成时间。

## 左侧四种浏览模式

左侧工具栏的浏览模式由 `SurfaceNavigationView` 定义，共四种：

### Capabilities / 能力域

默认视图，按产品能力分组展示 Feature。例如 Agent Execution、Kanban Automation、Governance 等。每个能力组显示页面、API 和文件指标；展开 Feature 后可以看到其关联页面和 API。

该模式适合回答“这个产品能力由哪些 Feature 组成”。人工整理的 Feature 与自动推导的 Feature 会分开显示。

### Surfaces / 页面 Surface

按前端 URL 路径构建树状浏览器，例如：

```text
/workspace
  /:workspaceId
    /kanban
    /sessions
    /feature-explorer
```

选中页面后，可以看到它关联的 Feature 和源文件。该模式适合从用户可访问的页面入口反查产品能力。

### APIs / API

按 API 路径构建树，并显示 HTTP method。它可以把 API 契约、Next.js 实现和 Rust 实现关联到 Feature；API 也可能处于尚未映射到 Feature 的状态。

该模式适合检查某个端点归属哪个 Feature、是否存在双后端实现，以及实现源文件在哪里。

### Paths / 路径

按源代码路径构建树，把页面/API Surface 追加到对应的文件路径下。该模式适合从已知文件反查页面、API 和 Feature 影响范围。

## 中间 Feature 详情区

选中 Feature 或 Surface 后，中间区域显示当前对象的概览指标：

- status；
- 页面数量；
- API 数量；
- 源文件数量；
- 关联会话数量；
- 当前 Feature 是否已有摩擦画像。

中间区域包含三个可折叠结构区：

### Source Files / 源文件

显示 Feature 关联的源文件树，并支持两种视图：

- `Tree`：按目录层级展开；
- `List`：按会话相关性排序查看。

每个文件可显示改动次数、关联会话数和最近更新时间。文件前的 checkbox 用于选择分析范围；选择结果会传递给会话分析抽屉。

### Frontend Routes / 前端路由

显示 Feature 声明或推导出的前端页面、路由和描述。

### API Source / API 来源

显示 Feature 关联的 API method、endpoint、描述和实现来源，并区分 API 契约、Next.js source 和 Rust source。

## 右侧 Context Inspector

当前真正挂载到右侧栏的是 `ContextPanel`，不是独立的多 Tab Inspector。它会根据当前选中对象显示：

### 当前 Surface

如果选中的是页面或 API 而不是 Feature，会显示 Surface 类型、关联 Feature 数量和源文件。

### 已保存历史

读取与当前 Feature 或文件匹配的 retrospective memory。结构化内容可能包括：

- Scope；
- Next ask；
- Must include；
- Avoid；
- Still need。

### Selected File Signals / 选中文件信号

显示选中文件关联的 Agent session，包括 provider、session ID、更新时间、prompt 历史、相关文件和恢复命令，并可展开查看：

- 工具调用分布；
- 读取/写入文件；
- 重复读取和重复命令；
- 失败工具调用。

### Related Features / 关联 Feature

显示当前 Feature 的相关 Feature ID。

### Session Analysis / 会话分析

当至少选中一个带有 session evidence 的文件时，可以打开会话分析抽屉，使用只读 specialist 对历史会话做复盘，并在 ACP 会话面板中给出后续输入建议。

## 抽屉与附加工作流

### Generate Feature Tree Drawer

负责 Feature Tree 预检、Agent/Quick Scan 模式、Dry Run、生成日志和写入结果确认。生成完成后页面会刷新 Feature 列表和 Surface Index。

### Session Analysis Drawer

接收选中的文件和其关联会话，允许选择 Provider 并启动只读分析。分析结果可以继续在 ACP ChatPanel 中查看，也可以跳转到完整 Session 页面。

### Analysis Session Drawer

会话分析启动成功后打开，内部使用 `ChatPanel` 显示 ACP 会话，并保留当前 workspace、仓库和 provider 上下文。

## 当前未完全接入的能力

源码中还定义了 `ScreenshotPanel` 和 `ApiPanel`：

- `ScreenshotPanel` 当前只显示“即将支持/待实现”状态；
- `ApiPanel` 已包含 API 选择、method/path 展示和真实请求逻辑；
- 当前 `FeatureExplorerInspectorPane` 只挂载 `ContextPanel`，没有把上述两个面板作为可见 Tab 渲染。

因此，界面文案中出现的“截图”和“API 探针”应视为已定义但尚未完整接入的预留能力，不能当作当前右侧已经存在的独立子菜单。

## 功能边界总结

```text
Feature Explorer
├── 仓库与 Feature Tree 管理
├── 能力域 / 页面 Surface / API / 文件路径浏览
├── Feature -> 页面 -> API -> 源文件关联
├── 文件改动与 Agent session 信号
├── 摩擦画像与已保存历史
├── 选中文件后的只读会话分析
└── 截图回归、API 探针（当前部分预留）
```

它最适合回答：

> 这个功能由哪些页面、API 和文件组成？最近哪些 Agent 会话处理过它？哪些文件存在重复读取或失败操作？下一次继续开发时应该把哪些文件和历史上下文交给 Agent？

## 主要实现位置

- 导航入口：`src/client/components/desktop-sidebar.tsx`
- 页面容器：`src/app/workspace/[workspaceId]/feature-explorer/page.tsx`
- 页面编排：`src/app/workspace/[workspaceId]/feature-explorer/feature-explorer-page-client.tsx`
- 数据加载：`src/app/workspace/[workspaceId]/feature-explorer/use-feature-explorer-data.ts`
- 浏览模式和 Surface 树：`src/app/workspace/[workspaceId]/feature-explorer/use-feature-explorer-view-model.ts`、`surface-navigation.tsx`
- 中间结构区：`feature-explorer-structure-sections.tsx`
- 右侧上下文与预留面板：`feature-explorer-inspector-panels.tsx`
- 生成抽屉：`generate-feature-tree-drawer.tsx`
- Rust Feature Explorer API：`crates/routa-server/src/api/feature_explorer.rs`
- Feature/Surface 索引读取：`src/core/spec/feature-surface-index.ts`
