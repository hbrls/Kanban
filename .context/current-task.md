# 左侧 Workspace 列表迁移方案（第一步）

日期：2026-10-10
状态：方案已编写，尚未实施。

## 1. 目标与已确认边界

将左侧菜单下方的 Placeholder 1–3 替换为 active Workspace 列表。点击 Workspace 按钮，沿用现有 Kanban 切换行为，进入 `/workspace/{workspaceId}/kanban`。

第一步的交付边界：

- 保留上方 Home / Kanban / Vision / Settings 菜单及其既有导航。
- 下方组显示真实 Workspace，点击语义为选择 Workspace；渲染为按钮，不加入上方功能菜单的 Link 列表。
- `DesktopSidebar` 自己调用现有 `useWorkspaces()`，列表跟随该组件的挂载生命周期加载。
- 保留现有 WorkspaceSwitcher，以及各页面对它的调用。第一步不删除、不重构、不迁移其搜索、创建等交互。
- 菜单与现有 WorkspaceSwitcher 各自维护查询结果，允许重复请求；不建立同步、缓存、Provider 或 global state。
- 不迁移 localStorage，不恢复历史选择，不兼容旧数据，也不新增隐式 default Workspace 回退。
- 只接通现有 Kanban 路由和数据链路；不接入 Vision 业务数据。
- 不修改后端、数据库、API 契约、Kanban 数据加载或 Agent 调度。

最终删除 WorkspaceSwitcher 属于第二步，本文件不提前设计或实施第二步。

## 2. 已核实的现有实现

| 位置 | 当前职责 | 本次使用方式 |
| --- | --- | --- |
| `src/client/components/desktop-sidebar.tsx` | 上方功能导航、分隔线、下方三个禁用占位项、展开/折叠 | 替换下方占位区，增加查询和切换按钮 |
| `src/client/hooks/use-workspaces.ts` | hook 内部 useState；挂载时请求 `/api/workspaces?status=active`；返回 workspaces/loading/error | 直接复用，不修改 hook |
| `src/client/components/desktop-app-shell.tsx` | 渲染 DesktopSidebar，传入当前 workspaceId | 保留原有 props 和调用方式 |
| `src/client/components/desktop-layout.tsx` | 另一处 DesktopSidebar 调用 | 保留原有 props 和调用方式 |
| `src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx` | 从路由读取 workspaceId；现有 handleWorkspaceSelect 调用 router.push | 菜单复用同样的目标路径，不修改页面 |
| `src/client/components/workspace-switcher.tsx` | 接收列表，选择时调用 onSelect；搜索、创建和 localStorage 写入 | 第一阶段保留原样 |

现有选择链路：

```text
WorkspaceSwitcher 点击某个 Workspace
    -> onSelect(workspaceId)
    -> KanbanPageClient.handleWorkspaceSelect(workspaceId)
    -> router.push(`/workspace/${workspaceId}/kanban`)
    -> Kanban 页面通过路由得到新的 workspaceId
    -> 现有请求和 SSE 使用该 workspaceId
```

WorkspaceSwitcher 并没有额外的“切换 Workspace”后端接口。当前选择由 URL 表示，因此迁移入口不需要增加另一份 activeWorkspaceId 状态。

占位项目前是带 `aria-disabled="true"` 的 div，没有 onClick；本次需要创建真实按钮和点击处理。

## 3. 目标结构与行为

```text
DesktopSidebar
├── 品牌区与展开/折叠按钮
├── 上方功能菜单：Home / Kanban / Vision / Settings
├── 既有分隔线
└── 下方 Workspace 列表
    ├── Workspace A
    ├── Workspace B（与传入 workspaceId 一致时高亮）
    └── Workspace C
```

列表遵循 API 返回的顺序和数量，不固定为三个，不新增排序或过滤；active 过滤已由 useWorkspaces 的查询参数完成。

点击目标始终为 `/workspace/{id}/kanban`。本阶段不解析当前功能页后缀，不增加 `/vision`、Sessions、Settings 等页面的切换分支。

由于 DesktopSidebar 是共享组件，这个下方列表会出现在所有使用它的 shell 中；从其他页面点击该列表也会进入所选 Workspace 的 Kanban。此影响来自共享组件，不代表接入其他页面的数据功能。

## 4. 产品代码实施细节

### 4.1 查询与路由

仅在 `desktop-sidebar.tsx` 中：

1. 从 `next/navigation` 增加 `useRouter` 导入，保留 `usePathname`。
2. 导入 `useWorkspaces`；需要标注渲染函数参数时使用同模块的 `WorkspaceData` 类型。
3. 在组件顶层调用 `useRouter()` 和 `useWorkspaces()`，解构 `workspaces`、`loading`、`error`。
4. 使用已有传入值 `workspaceId` 判断当前 Workspace，不另建 selectedWorkspaceId 状态。
5. 不自行 fetch、不再额外调用 fetchWorkspaces；使用 hook 既有挂载查询。

点击处理的核心逻辑：

```tsx
const handleWorkspaceSelect = (nextWorkspaceId: string) => {
  if (nextWorkspaceId === normalizedWorkspaceId && pathname.endsWith("/kanban")) return;
  router.push(`/workspace/${encodeURIComponent(nextWorkspaceId)}/kanban`);
};
```

在 Kanban 页面点击当前 Workspace 不重复导航；从其他功能页点击当前 Workspace 仍进入其 Kanban。encodeURIComponent 用于正确拼装路径，不改变 Workspace ID 数据。

### 4.2 删除占位实现并渲染列表

删除 `PlaceholderNavItem`、`placeholderItems`、`renderPlaceholderItem`，移除不再使用的 Box / Layers / Archive 导入，增加 Folder 图标。

新增局部 `renderWorkspaceItem(workspace)`，每项具备：

- `key={workspace.id}`。
- `<button type="button">` 和 `onClick`，不使用 Link、不携带 href。
- `title={workspace.title}` 与 `aria-label={workspace.title}`，折叠时也能识别名称。
- `aria-pressed={workspace.id === normalizedWorkspaceId}` 表达当前选择。
- Folder 图标，展开时显示 `workspace.title`，长名称 truncate。
- 当前项使用既有 `bg-desktop-bg-active text-desktop-accent`；其他项使用既有次要文字色和 hover token。
- 展开与折叠的行高、间距、圆角、图标尺寸沿用当前菜单样式；按钮补齐 `w-full` 和文本左对齐，折叠时使用原有 `h-10 w-10 justify-center`。

不修改上方 `primaryItems`、`isActive`、`renderNavItem` 和 topAction 的行为。

### 4.3 下方区域与状态

保留既有分隔线和两组上下相邻的位置，不让下方列表吸底。

下方列表区域使用 `min-h-0 overflow-y-auto`，在 Workspace 较多时允许列表区域滚动；上方功能菜单保持可见。不另加固定高度或新的整体布局。

状态渲染优先级：

| 条件 | 下方区域 |
| --- | --- |
| loading | 显示加载提示 |
| 非 loading 且 error | 显示简短的加载失败提示 |
| 非 loading、无 error 且列表为空 | 显示空列表提示 |
| 查询成功且列表非空 | 渲染全部 Workspace 按钮 |

提示在展开状态显示文字；折叠状态使用小图标并提供本地化 title / aria-label。提示不是 Workspace 选择按钮。

不展示底层 error.message，不新增重试、自动刷新或跨组件同步机制。当前 workspaceId 不在列表中时，没有选中项，不自动跳转或补造 Workspace。

### 4.4 i18n

复用 `t.common.loading` 和 `t.workspace.noWorkspacesYet`。

在 `workspace` 字典中增加 `listLoadFailed`：

- `src/i18n/types.ts`：`listLoadFailed: string`。
- `src/i18n/locales/en.ts`：`"Failed to load workspaces"`。
- `src/i18n/locales/zh.ts`：`"工作区列表加载失败"`。

Workspace 名称使用后端返回的用户数据，不作为翻译键。原有 placeholderOne/Two/Three 字典键第一步保留，避免扩展到无关字典清理。

## 5. 文件改动清单

| 文件 | 计划改动 |
| --- | --- |
| `src/client/components/desktop-sidebar.tsx` | 查询 Workspace、下方列表、按钮切换、选中样式及三种提示状态 |
| `src/i18n/types.ts` | 增加 workspace.listLoadFailed 类型 |
| `src/i18n/locales/en.ts` | 增加对应英文文案 |
| `src/i18n/locales/zh.ts` | 增加对应中文文案 |
| `src/client/components/__tests__/desktop-sidebar.test.tsx` | mock 查询与路由，验证菜单选择和既有导航 |
| `docs/fitness/unit-test.md` | 实施测试后登记针对性证据与实际状态 |

不新增运行时依赖。不改变 DesktopSidebar / DesktopAppShell 的 props，不修改 KanbanPageClient、useWorkspaces、WorkspaceSwitcher 或 Rust 文件。

Storybook 使用 DesktopSidebar 后也会调用 hook；本阶段不扩展 Storybook 的全局 fetch mock 基础设施。既有 story 可以显示加载/失败/空状态，交互验证使用隔离的组件测试和桌面手工检查。

## 6. 针对性测试设计

复用 `desktop-sidebar.test.tsx`，用固定 Workspace fixture mock `useWorkspaces()`，mock `useRouter().push`，不依赖实际 Rust 服务。

新增或调整这些行为用例：

1. 成功返回多个 Workspace 时，渲染同名按钮，下方不再出现三个 Placeholder。
2. 点击未选中的 Workspace，router.push 收到准确的 `/workspace/{id}/kanban`；不会走功能菜单 Link。
3. 在 Kanban 点击当前 Workspace，不重复导航；从其他功能页点击当前 Workspace 仍进入 Kanban；用 rerender 更换 workspaceId 后，aria-pressed 和选中样式转移到新项。
4. loading、error 和成功空列表分别显示相应提示，失败不伪装为空列表。
5. 折叠后隐藏 Workspace 文字，但按钮仍有可访问名称，并能执行同样的切换。
6. 上方 Home / Kanban / Vision / Settings 的顺序、href、active 判定和折叠按钮保持现有行为。

每个用例前恢复 pathname、查询 mock 返回值和 push mock，避免测试互相污染。renderNavItem 仍为链接，Workspace 为按钮，因此现有 getAllByRole("link") 的菜单顺序断言仍然适用。

当前测试中有一条与源码不符的旧断言：要求存在 Harness 链接，但 primaryItems 只有 Home / Kanban / Vision / Settings。实施时在同文件将该断言改为 Harness 不存在，并把“下方只有 placeholders”的用例名改为 Workspace 列表，不能为使测试通过恢复历史菜单。

已有 `use-workspaces.test.tsx` 覆盖挂载时查询 `/api/workspaces?status=active`；本次 hook 未变化，不新增重复的查询实现测试。

## 7. 实施顺序与验证

实施顺序：

1. 更新 sidebar 测试 mock，修正同文件失真的 Harness 断言，补充按钮切换和选中行为用例。
2. 增加 i18n 文案及类型。
3. 实施 DesktopSidebar 的查询、按钮列表、状态与折叠显示。
4. 运行针对性检查，按实际结果填写测试证据。
5. 手工检查桌面 Kanban 路由切换，确认原 WorkspaceSwitcher 仍存在。

针对性命令：

```bash
pnpm exec vitest run src/client/components/__tests__/desktop-sidebar.test.tsx src/client/hooks/__tests__/use-workspaces.test.tsx src/i18n/__tests__/i18n.test.ts
pnpm exec eslint src/client/components/desktop-sidebar.tsx src/client/components/__tests__/desktop-sidebar.test.tsx src/i18n/types.ts src/i18n/locales/en.ts src/i18n/locales/zh.ts
```

这是局部前端改动，按 DEVELOPMENT.md 使用相关检查；不把 E2E、CI、Docker、Git hooks、Rust 测试或完整打包设为前置条件。此文档阶段不执行产品测试，所有实现与验证均为待完成。

手工检查使用已有桌面开发环境；需要启动时从根目录运行 `pnpm tauri:dev`：

- 准备两个 active Workspace，进入其中一个的 Kanban。
- 下方列表显示它们，当前 Workspace 高亮；点击另一个进入对应 Kanban URL，右侧走既有加载流程。
- 展开/折叠后都可以点击，长名称截断，较长列表可以滚动。
- 上方功能菜单和现有顶栏下拉框仍可使用。
- 不以两个独立列表立即同步为验收要求。

## 8. 验收标准

- [ ] Placeholder 1–3 已被 active Workspace 列表替换。
- [ ] 查询直接复用 useWorkspaces，挂载时自动加载。
- [ ] Workspace 项是按钮，当前项根据传入 workspaceId 高亮。
- [ ] 点击非当前项执行现有语义的 `/workspace/{id}/kanban` 路由导航。
- [ ] 展开、折叠、加载、失败、空列表与长列表均可正常显示。
- [ ] 上方功能菜单不变，原 WorkspaceSwitcher 保留。
- [ ] 未新增同步机制、global state、Provider、历史数据兼容或 localStorage 迁移。
- [ ] 针对性测试和 lint 通过，验证证据按实际结果填写。
- [ ] 第二步删除 WorkspaceSwitcher 尚未实施。
