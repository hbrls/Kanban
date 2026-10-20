# Home 页面改造方案

> 版本：2026-10-03 修订（含同日复核修订，见 §14）
> 范围：仅 Home。本方案不涉及、不依赖、不改变任何其他功能面。

## 1. 目标

Home 是 Routa 的**启动面**，不是 Splash，也不是只负责跳转的中转页。

"系统级启动"在代码里分两层，本方案只改第二层：

1. **原生层**（已完成，不在本方案内）：Tauri 启动时先起内嵌后端，并阻塞到后端确认就绪。
   `apps/desktop/src-tauri/src/lib.rs:833-843`，注释原文 *Block startup until the backend is definitely ready*。
2. **前端层**（本方案）：Home 是后端就绪后用户落地的第一个界面，负责把"用户可开始工作"这件事推进完成。

本次改造目标：

- 保留 `/` Home 路由。
- 保留 Home 在左侧菜单中的第一项。
- 把 Home 当前隐含、无反馈、错误会被吞掉的初始化，变成**串行、可观察、阻塞式**的流程。
- 初始化未完成前阻塞其他一级入口；完成后解除。
- 保留 Home 的实际功能：工作区切换与创建、Provider 配置、代码库添加、最近会话、进入工作区。
- 清理大型、低价值、流程感过强的 onboarding 向导。
- 尽量不修改现有 API、请求路径或 HTTP 状态码。

## 2. 非目标

以下内容**不属于本方案**，也不构成方案成立与否的前提：

- 其他功能面（含 Harness、Team、Sessions 等）是否存在、是否可用、内部如何实现。
- 其他功能面的加载状态与错误处理。
- 后端 API 的实现、路由与状态码。
- 侧栏一级导航项的增删。
- 恢复任何已被删除的功能。

Home 的启动链不调用任何其他功能面。已核对：`src/app/page.tsx` 中不存在对 `team` / `harness` / `spec` 的引用；唯一的**程序化**跳转在 `page.tsx:272-283`（`?mode=session` → `/sessions`、`?mode=planning` → `/kanban`）。页面另有指向工作入口的 `<Link>`（`page.tsx:362-405`、`481-505`），它们是 Home 自己的工作入口（§7.2 保留），不是对其他功能面的依赖。因此其他功能面的变更不影响本方案。

## 3. 职责边界

| 归 Home | 不归 Home |
| --- | --- |
| 本地设置读取 | 其他功能页是否存在 |
| 工作区列表 / 当前工作区 | 其他功能页的内部实现 |
| ACP 连接 + 本地 Provider 检查 | 其他页面的加载与错误处理 |
| codebase 加载 + 访问权限检查 | 后端 API 的实现与 HTTP 状态码 |
| 最近 sessions | 侧栏一级导航项的增删 |
| 汇总为 Ready / attention / error | |

## 4. 当前实现与问题

当前实现位于 `src/app/page.tsx`（554 行），初始化逻辑分散在 6 个 `useEffect` 中（`page.tsx:86-176`：86、90、97、111、120、163）。

### 4.1 现有工作逐条对照

| 工作 | 位置 |
| --- | --- |
| 加载 active workspaces | `page.tsx:68` → `client/hooks/use-workspaces.ts:36-79` |
| 确定 active workspace | `page.tsx:97-109` |
| 建立 ACP 连接、检查本地 Provider | `page.tsx:90-95` → `client/hooks/use-acp.ts:264` |
| Registry Provider 后台发现 | `use-acp.ts:408` 起（后台任务） |
| 加载当前 workspace 的 codebases | `page.tsx:82` → `use-workspaces.ts:81-109` |
| 检查 codebase 路径可访问 | `page.tsx:163-176` → `client/utils/repo-validation.ts:20` |
| 请求最近 sessions | `page.tsx:120-161`（`/api/sessions?...&limit=6`） |
| 读取 onboarding / Provider 配置 | `page.tsx:111-118` → `client/utils/onboarding.ts` |
| 创建工作区、打开 Provider 设置、添加 codebase | `page.tsx:178-238` |
| 渲染 | `page.tsx:285-538` |

### 4.2 必须修掉的四个问题

**P1 — 请求失败被伪装成空数据。** 最近 sessions 的 `catch` 直接写入空列表：

```ts
// page.tsx:145-150
} catch {
  if (cancelled) return;
  setWorkspaceHomeData((current) => ({ ...current, [activeWorkspaceId]: EMPTY_HOME_DATA }));
}
```

用户无法区分"没有最近会话"和"加载失败"。

**P2 — loading 是死变量。** `page.tsx:79` 的 `_recentSessionsLoading` 带下划线且无任何消费者，`setRecentSessionsLoading` 在跑但不产生任何 UI 效果。

**P3 — hook 吞掉错误。** 两个 hook 在非 2xx 时直接返回，既不记录错误也不区分"空"与"失败"：

```ts
// use-workspaces.ts:45    useWorkspaces
if (!res.ok) return;
// use-workspaces.ts:91    useCodebases
if (!res.ok) return;
```

（注意：两个 hook 在同一个文件 `use-workspaces.ts` 内。）

**P4 — 存量硬编码中文。** 违反 `AGENTS.md` 的 i18n 规则：

```ts
// page.tsx:47-64
function formatRelativeTime(...) { ... return "刚刚"; ... return `${mins} 分钟前`; }
function getSessionLabel(session) { ... return `会话 ${session.sessionId.slice(0, 8)}`; }
```

### 4.3 需要保留的现有语义

**workspace 缓存：每个 workspace 只拉一次。**

```ts
// page.tsx:120-121
if (!activeWorkspaceId || workspaceHomeData[activeWorkspaceId]) return;
// page.tsx:161
}, [activeWorkspaceId, workspaceHomeData]);   // 靠早退避免成环
```

迁移到新 hook 时必须保留，否则会重复请求或死循环。

**`ONBOARDING_MODE_KEY` 不是初始化步骤。** 它仅在 `page.tsx:117,195` 与 `onboarding.ts:9` 出现，运行时无其他消费者。不再作为进度的一部分。

**`HomeInput` 与本方案无关，不构成约束。** 它是 `src/client/components/home-input.tsx` 的组件（定义在 `home-input.tsx:114`），使用者是 `src/app/workspace/[workspaceId]/sessions/sessions-page-client.tsx`（import 在第 7 行、使用在第 187 行）。`src/app/page.tsx` 不引用它，本方案只改 Home，不会触及该组件。（早期草稿曾写"被 `sessions-page-client.tsx:26` 使用、不能删除或重命名"，属误记，已删除该约束。）

## 5. 目标初始化流程

```text
读取本地设置（非阻塞）
    -> 加载 active workspaces
    -> 确定 active workspace
    -> 连接 ACP / 检查本地 Provider
    -> 加载当前 workspace 的 codebases
    -> 检查 codebase 访问权限
    -> 加载最近 sessions
    -> Home Ready
```

### 5.1 步骤定义

| 步骤 | 数据来源 | 失败影响 | 备注 |
| --- | --- | --- | --- |
| 本地设置 | localStorage + 现有 Provider 配置读取函数 | 不阻塞 | 读取失败时使用默认值 |
| 工作区列表 | `useWorkspaces` | 阻塞 | 区分请求失败与空列表 |
| 当前工作区 | URL、列表 | 阻塞 | 必须验证 workspace 仍为 active |
| ACP / Provider | `useAcp` | 阻塞 | `connected` / `loading` / `error` / `providers` 共同决定结果 |
| Codebases | `useCodebases` | 阻塞当前 workspace 数据 | 没有 codebase 是"未配置"，不是接口错误 |
| Repo 访问权限 | `collectAccessibleRepoPaths` | 提示问题，可继续 | 展示不可访问原因与添加入口；**需先扩展该 util**（见 §8.4） |
| 最近 Sessions | `/api/sessions` | 提示问题，可继续 | 加载失败不能伪装成"没有最近会话" |

工作区列表为空时，初始化在"工作区列表"步骤结束并显示创建 workspace 的紧凑表单；创建成功后从"确定当前工作区"继续。

### 5.2 关于 ACP 的执行位置

ACP 连接与工作区列表**无依赖**——现状即在 mount 时并行发起（`page.tsx:90-95`）。本方案仍将其作为串行步骤放在"确定当前工作区"之后，理由是"用户能看到每一步在跑"优先于首屏速度（见 §1）。若后续需要优化首屏，可把该步骤与工作区加载并行化，**状态模型不变**。

Registry Provider 的后台发现（`use-acp.ts:408`）保持后台语义，显示为次级状态，不阻塞 Home Ready。

## 6. 状态模型

每个步骤统一使用：

```text
pending   尚未开始
running   正在执行
success   已完成
attention 已完成，但发现需要用户处理的问题
error     执行失败，可重试
skipped   当前没有适用对象
```

进度表示**步骤已被处理的程度**，不等同于系统全部可用。最终可以出现：

```text
初始化完成，但有 1 项需要处理
```

例如 Provider 查询返回 2xx 但没有可用 Provider，应显示 `attention`，而不是伪造 API 错误。

## 7. 目标 UI

```text
Home
当前工作区切换器

初始化状态
[进度条]
[步骤列表]

最近工作
[打开 Kanban] [查看 Sessions]

最近会话
[最近会话列表]
```

### 7.1 初始化面板

面板包含：

- 标题与整体进度，例如 `3 / 6`。
- 当前运行步骤。
- 每一步的状态图标、结果摘要和操作入口。
- error / attention 状态的重试或配置按钮。
- 完成后可收缩为"初始化完成"摘要，仍允许展开查看详情。

示例：

```text
初始化 Home                                    3 / 6

✓ 工作区已加载                                  1 个工作区
✓ 当前工作区                                    Default Workspace
✓ Agent Runtime                                 已连接，2 个 Provider 可用
◌ 加载代码库                                    正在请求
○ 检查代码库访问权限                            等待代码库
○ 加载最近会话                                  等待中
```

没有配置代码库时显示"尚未配置"并提供 `[添加代码库]`，不显示为错误。Provider 未配置时提供 `[配置 Provider]`；ACP 连接失败时提供 `[重试连接]`。

### 7.2 工作入口

初始化完成后保留轻量入口（`[打开 Kanban]`、`[查看 Sessions]`、最近 session），使用紧凑的链接或按钮，不使用三张大型"模式介绍"卡片。Home 不重复解释各工作面的内部机制。

### 7.3 旧向导的处理

删除或重构：

- 大型 Hero 文案（`page.tsx:330-341`）。
- "你要进入哪种执行模式？"标题及三张模式说明卡（`page.tsx:360-407`）。
- 大型 `OnboardingCard`（`page.tsx:308-319`、`344-358`；组件在 `home-page-sections.tsx:637`）。
- `3/3` onboarding 完成徽章。
- "继续稍后"按钮。
- 重复的 readiness pills（`page.tsx:409-471`）。

保留实际动作，移动到初始化步骤对应的操作入口。`ONBOARDING_MODE_KEY` 可暂时继续兼容读取，但不再影响 Home 初始化或默认跳转。

**`ONBOARDING_COMPLETED_KEY` 仍有 Home 之外的消费者，不能一并废弃。** `settings-panel.tsx:18, 70` 读取它，且 `page.tsx:535` 把 `handleResetOnboarding` 传给 `SettingsPanel`。改造 Home 时若移除 onboarding 状态，必须同时处置这条链路（保留兼容读取，或移除 `SettingsPanel` 的 `onResetOnboarding` prop），否则 Settings 面板的接线会断。§8.3 的"保留 SettingsPanel 挂载点"需连带这一点。删除 `OnboardingCard` 后，`src/i18n/types.ts:550` 的 `onboarding` 命名空间会留下一批死键，需一并清理。

## 8. 代码结构

### 8.1 编排 Hook（新增）

```text
src/client/hooks/use-home-initialization.ts
```

职责：

- 串行启动初始化步骤。
- 管理当前步骤与整体状态。
- 处理取消、重试与 workspace 切换。
- 维护 workspace-scoped 数据的生命周期（保留 §4.3 的缓存语义）。
- 把接口成功但数据异常的情况转成前端 `attention` / `error`。

返回：

```ts
{
  steps: HomeInitializationStep[];
  activeStepId: HomeInitializationStepId | null;
  completedCount: number;
  totalCount: number;
  ready: boolean;
  hasAttention: boolean;
  retry: (stepId?: HomeInitializationStepId) => Promise<void>;
  refresh: () => Promise<void>;
}
```

### 8.2 状态面板（新增）

```text
src/client/components/home-initialization-panel.tsx
```

只渲染步骤状态、进度条、错误说明与操作按钮，不发请求。

### 8.3 Home 页面

`src/app/page.tsx` 缩减为：

- `DesktopAppShell`。
- 现有左侧菜单与 workspace switcher。
- `useHomeInitialization`。
- `HomeInitializationPanel`。
- 工作入口与最近会话区域。
- `SettingsPanel`、`RepoPicker` 等现有交互的挂载点。

不把新的串行逻辑继续堆回 `page.tsx` 的多个 `useEffect`。

### 8.4 现有 Hook 的最小扩展

不修改后端接口，只补可观测状态：

| Hook | 现状 | 需补 | 位置 |
| --- | --- | --- | --- |
| `useWorkspaces` | 非 2xx 直接 return | `error` | `use-workspaces.ts:45` |
| `useCodebases` | 非 2xx 直接 return | `loading`、`error` | `use-workspaces.ts:91` |
| `useAcp` | 已有 `connected` / `loading` / `error` / `providers` | 无需改动 | `use-acp.ts:171-184` |
| `repo-validation` | 只返回可达性布尔值，非 2xx 的原因在 `catch` 中被丢弃 | 返回不可访问原因 | `repo-validation.ts:15-17`、`20-30` |

`repo-validation.ts` 现状只暴露 `isAccessibleRepoPath(): Promise<boolean>` 与 `collectAccessibleRepoPaths(): Promise<Set<string>>`；底层 `/api/clone/branches` 失败的原因在 `catch { return false }`（`repo-validation.ts:15-17`）里被丢弃。§5.1 要求"展示不可访问原因"，因此必须扩展该 util 使其保留错误信息（例如返回 `{ path, accessible, reason }`），否则 §6 的 `attention` 只能显示布尔结果。

最近 sessions 的请求保留独立的 `loading` 与 `error`，不得在失败时覆盖为空数组。

### 8.5 导航锁定

在 `DesktopAppShell` / `DesktopSidebar` 增加可选的 `navigationLocked`：

- 当前属性定义见 `desktop-app-shell.tsx:58-72`、`desktop-sidebar.tsx:34-39`，需新增一个 prop 并透传。
- Home 项保持**可用且高亮**，始终为第一项（`desktop-sidebar.tsx:57-64`）。
- 其他一级导航项设置 `aria-disabled`，阻止点击与键盘跳转。
- 初始化完成、或进入明确的 error / attention 可操作状态后解除锁定。
- 配置 Provider、创建 workspace、添加 codebase 等 Home 内部操作不受锁定影响。
- 本方案不新增、不删除任何一级导航项。

锁定只是 UI 行为，不是数据安全边界；各页面仍必须独立处理自己的加载与错误状态。

## 9. 接口结果解释规则

前端对现有接口结果做结构校验，但不修改 HTTP 语义：

> 已核实的接口形状（Rust/Axum 侧，桌面运行时由 `desktopAwareFetch` 命中 `127.0.0.1:3210`）：
> - `GET /api/workspaces?status=active` → `{"workspaces": [...]}`（`crates/routa-server/src/api/workspaces.rs:37-43`），与 `use-workspaces.ts:47` 的 `data.workspaces` 一致。
> - `GET /api/sessions?workspaceId=&limit=` → `{"sessions": [...]}`（`crates/routa-server/src/api/sessions.rs:125-155`），与 `page.tsx:142` 的 `sessionsData?.sessions` 一致。
> - 注意 `src/app/api/sessions/` 下没有 `route.ts`（仅有 `team-run.ts` 与测试），`/api/sessions`、`/api/workspaces` 均由 Rust 提供——符合 §2 的"后端 API 非目标"。
> - 后端在成功路径上始终返回完整结构，故下述"2xx 但缺字段"分支为防御性规则，只会在测试（mock）中出现。

- 2xx + 合法 workspace 数组：`success`。
- 2xx + 缺少 workspace 数组：`error`，文案说明"请求成功但数据格式不完整"。
- 2xx + 空 workspace 数组：`success` + 空状态，显示创建 workspace。
- 代码库数组为空：`skipped` / "尚未配置"。
- repo 检查返回非 2xx：`attention`，提供修复或重新检查。
- sessions 返回空数组：`success`，显示"暂无最近会话"。
- sessions 请求失败：`attention` / `error`，不能伪装为空数组。
- ACP 已连接但无 available Provider：`attention`，提供 Provider 配置入口。

## 10. i18n

所有新增状态、按钮、错误说明必须通过 i18n，不在组件中硬编码中英文。

同时修复 §4.2 P4 的两处存量硬编码（`page.tsx:47-64`），将 `formatRelativeTime` / `getSessionLabel` 的文案改为 `t(...)`。

实施注意：

- **i18n 新增需同步 3 个文件。** `home` 命名空间只在 `src/i18n/types.ts:99-164` 与 `locales/en.ts`、`locales/zh.ts` 声明；`types-extended.ts`、`types-tail.ts`、`locales/en-extended.ts`、`locales/en-tail.ts` 中都没有 `home`。只改 locale 不改 `types.ts` 会编译报错。建议为初始化面板单独开一个命名空间（如 `homeInitialization`），同样需要这三处。
- **`formatRelativeTime` 是纯函数，拿不到 `t`。** 它需要把 `t` 作为参数传入，或把调用点移到组件内。另注意仓库里已有一个同名函数 `src/app/workspace/[workspaceId]/ui-components.tsx:285`，但它同样硬编码英文（`now` / `5m ago`），不能直接复用；该处属 Home 范围外，仅备注。
- 清理 §7.3 提到的 `onboarding` 死键。

## 11. 测试计划

### 11.1 Home 页面测试

更新 `src/app/__tests__/page.test.tsx`，覆盖：

- Home 渲染在 `/`。
- Home 对应左侧菜单第一项。
- 旧的大型 onboarding / mode 卡片不再出现。
- 初始化步骤按顺序推进；当前步骤 `running`，成功步骤 `success`。
- 2xx 但返回结构异常时显示解释性文案。
- 空 workspace 显示创建表单。
- Provider、codebase、repo access、sessions 的 attention / error 状态可见。
- 重试会重新执行当前失败步骤。
- 初始化完成后工作入口可用。

### 11.2 Hook 测试

新增 `use-home-initialization` 的状态转换测试：

- 正常串行路径。
- 工作区请求失败。
- 没有工作区。
- workspace 创建后继续初始化。
- ACP 连接失败与重试。
- 没有 codebase 时跳过 repo 检查。
- repo 检查发现不可访问路径。
- sessions 请求失败但不覆盖已有状态。
- workspace 切换只重置 workspace-scoped 步骤。

### 11.3 导航锁定测试

为 `navigationLocked` 增加用例：

- `navigationLocked` 为真时 Home 可用，其他一级项不可用。
- 解锁后所有链接恢复。

> 测试前置：`vitest.config.ts:13` 的 `exclude` 排除了 `**/.worktrees/**`，但没有排除仓库内嵌的 worktree（`**/.kilo/**`）。由于 `include` 使用 `**/__tests__/**` 通配，运行时会重复抓取同名测试（传入 2 个文件实际会跑 4 个），干扰本方案测试结果的判读。已核实：`.kilo/worktrees/tulip-verdict/` 确实存在，且含重复的 `src/app/__tests__/page.test.tsx`、`src/client/components/__tests__/desktop-sidebar.test.tsx`。另外 `desktop-sidebar.test.tsx` 中存在一条与本方案无关的失效断言，定位在第 31 行：该用例用 `getByRole("link", { name: "Harness" })` 期待 Harness 链接存在，但 `desktop-sidebar.tsx:74-84` 的二级菜单只有 Settings，没有任何 Harness 链接；同文件第 42 行又断言 Harness 不存在，两条互相矛盾。实施前先处理这两点，否则 §11 的结论不可信。

## 12. 验收标准

```bash
npm run tauri dev
```

- 冷启动进入 Home，不是 Splash，也不自动跳转。
- 左侧菜单仍存在，Home 仍是第一项。
- 用户能看到当前初始化步骤和进度。
- 初始化过程按顺序推进。
- 没有 workspace 时可以创建并继续流程。
- Provider 连接问题能在 Home 中解释和重试。
- 没有 codebase 时显示未配置，不是错误或无限加载。
- 最近 sessions 加载失败不会被显示成"没有会话"。
- 初始化完成后可以进入工作区。
- Home 的 Provider、Repo、workspace 创建功能仍然可用。
- 没有修改现有 API 的路径或 HTTP 状态码。

## 13. 实施顺序

0. 先处理 §11.3 的测试前置：把 `**/.kilo/**` 加入 `vitest.config.ts` 的 `exclude`；修掉 `desktop-sidebar.test.tsx:31` 的失效断言。否则后续测试结论不可信。
1. 为 `useWorkspaces`、`useCodebases` 增加 `error` / `loading`；扩展 `repo-validation` 使其保留不可访问原因（§8.4）；把最近 sessions 的 `loading` 与 `error` 接上（修 P1、P2、P3）。
2. 新增 `useHomeInitialization`：串行状态机 + 取消/重试，保留 workspace 缓存语义。
3. 新增 `HomeInitializationPanel`，接入 i18n（同步 `types.ts` + `en.ts` + `zh.ts`）。
4. 将 `page.tsx` 改为精简编排壳，保留现有功能动作；顺带修 P4 的硬编码中文（`formatRelativeTime` 需传入 `t`）。
5. 增加 `navigationLocked`（`DesktopAppShell` → `DesktopSidebar` 透传）。
6. 移除旧 onboarding / mode 的大型视觉结构与无效展示；处置 `ONBOARDING_COMPLETED_KEY` 与 `SettingsPanel.onResetOnboarding` 的耦合（§7.3）。
7. 更新 Home 与 Hook 测试。
8. 使用 Tauri 开发环境做冷启动、错误、重试、创建 workspace 与导航验收。

## 14. 复核修订记录

2026-10-03 对方案做了一次逐条代码复核。修订如下（均为实施前修订，不改变方案成立性与 §13 顺序）。

**修正的事实性错误**

| # | 位置 | 原文 | 修正 |
| --- | --- | --- | --- |
| E1 | §4.3 | `HomeInput` 被 `sessions-page-client.tsx:26` 使用，不能删除或重命名 | `HomeInput` 在 `home-input.tsx:114`，使用者是 `sessions-page-client.tsx:7,187`；`page.tsx` 不引用它，该约束不成立，已删除 |
| E2 | §4 | 初始化分散在 5 个 `useEffect` | 实际 6 个（`page.tsx:86,90,97,111,120,163`） |
| E3 | §2 | "唯一的对外跳转" | 应为"唯一的程序化跳转"；页面另有 `page.tsx:362-405`、`481-505` 的工作入口 `<Link>` |
| E4 | §4.1 | `use-workspaces.ts:36-66` / `81-112` / 渲染 `285-537` | `36-79` / `81-109` / `285-538` |

**补充的遗漏**

| # | 位置 | 补充 |
| --- | --- | --- |
| G1 | §5.1、§8.4 | repo 访问权限要"展示原因"，但 `collectAccessibleRepoPaths` 只返回布尔值、丢弃错误；需扩展该 util |
| G2 | §10 | `formatRelativeTime` 是纯函数拿不到 `t`；仓库已有的同名函数（`ui-components.tsx:285`）同样硬编码英文，不可复用 |
| G3 | §10 | i18n 新增需同步 `types.ts` + `en.ts` + `zh.ts`（extended/tail 无 `home`）；删 OnboardingCard 会留下 `onboarding` 死键 |
| G4 | §7.3、§8.3 | `ONBOARDING_COMPLETED_KEY` 仍被 `settings-panel.tsx:18,70` 消费，`page.tsx:535` 的 `onResetOnboarding` 依赖它，需一并处置 |
| G5 | §11.3 | 失效断言定位到 `desktop-sidebar.test.tsx:31` |

**复核核实为真的前提**（支撑方案成立，无需改动）

- 内嵌 worktree 造成测试重复：`.kilo/worktrees/tulip-verdict/` 存在，`exclude` 未排 `**/.kilo/**`。
- `/api/workspaces`、`/api/sessions` 由 Rust 提供且返回结构与前端读取一致（详见 §9 顶部）。
- `page.tsx` 无 `team` / `harness` / `spec` 引用；旧 `OnboardingCard` 仅被 Home 使用，删除安全。
- `useAcp` 已有 `connected` / `loading` / `error` / `providers`；`DesktopAppShell` → `DesktopSidebar` 透传链完整；`navigationLocked` 全仓不存在，新增无冲突。
