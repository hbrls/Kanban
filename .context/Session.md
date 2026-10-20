# Session

本文记录 Session 主菜单的实现范围、可删除边界以及与 Kanban 的隔离要求。
本次调查只针对“主菜单的 Session 功能”，不修改代码，不处理 Kanban 的 Session 机制。

## 1. 结论

Session 与 Team 不同：

- 主菜单中的 Session 导航项可以独立删除；
- Session 的 ACP、存储、API、ChatPanel 和会话详情能力不能作为主菜单删除的一部分一并删除；
- 当前源码仍有首页、HomeInput 和 Kanban 相关代码指向 `/workspace/:workspaceId/sessions/:sessionId`，
  因此本轮不删除 Session 详情路由、不修改这些调用方；
- 如果未来要移除所有用户可见的 Session 面板，需要另行设计 HomeInput 创建后的落点、会话详情查看器和
  Kanban 内部 Session Viewer，不能与本轮主菜单删除混在一起。

推荐本轮只做：

```text
删除主导航 Session 菜单项
保留 Session 页面、详情页、API、ACP 和数据库
不修改 Kanban 代码和 Kanban Session 处理/恢复机制
```

## 2. 主菜单入口

主导航中的 Session 项位于：

- `src/client/components/desktop-sidebar.tsx`
- `src/client/components/desktop-nav-rail.tsx`

两处都创建：

```text
id: "sessions"
label: t.nav.sessions
href: /workspace/:workspaceId/sessions
```

这两处是本轮可以直接删除的 UI 入口。修改时应同时：

- 删除 `sessions` 导航项；
- 删除因此变成未使用的 `ScrollText` import（仅当没有其他消费者）；
- 更新顶部导航注释和主导航测试；
- 保留 Home、Kanban、Settings、Workspace 切换和折叠行为；
- 不改变 Kanban item 的顺序、href 或激活态判断。

Desktop 托盘也有独立的 Sessions 菜单：

- `apps/desktop/src-tauri/src/tray.rs`
- `TRAY_WORKSPACE_SESSIONS_ID`
- `/sessions` workspace route mapping

它不属于 Web 左侧主导航。如果产品定义“主菜单”包含 Desktop 托盘菜单，可以在同一轮删除；
否则本轮保留，避免扩大范围。无论是否删除托盘项，都不能删除 Session runtime。

## 3. Session 面板和路由现状

Session UI 目录为：

```text
src/app/workspace/[workspaceId]/sessions/
src/app/workspace/[workspaceId]/sessions/[sessionId]/
```

包含：

- Session 列表/恢复面板 `sessions-page-client.tsx`；
- Session 详情面板 `session-page-client.tsx`；
- `SessionsOverview` 列表、重命名、删除和刷新；
- ChatPanel、SessionContextPanel、Trace/Canvas 关联；
- 当前 Session 的历史、父子 Session、同级 Session 和恢复操作。

本轮不删除这些目录。原因不是保留 Team，而是当前它们仍是普通 ACP Session 的通用 UI，且源码中有多处
非主菜单入口：

- `src/app/page.tsx` 的 Sessions Surface 和最近 Session 卡片；
- `src/client/components/home-input.tsx` 创建 Session 后默认跳转到
  `/workspace/:workspaceId/sessions/:sessionId`；
- `src/app/workspace/[workspaceId]/overview/page.tsx` 重定向到 Sessions；
- `src/app/debug/acp-replay/page-client.tsx`、`trace-panel.tsx`、`task-panel.tsx` 读取 Session API；
- Kanban 源码存在打开 Session 详情的链接和 ChatPanel 使用点。

因此，删除主菜单不等于删除 Session 面板。主菜单消失后，页面仍可能通过首页、深链接、Kanban 内部
入口或其他调试/恢复流程访问，这是本轮有意保留的行为。

## 4. 共享运行能力（本轮不得删除）

以下能力不是主菜单专属：

- `src/client/acp-client.ts`；
- `src/core/store/acp-session-store.ts`；
- `crates/routa-core/src/store/acp_session_store.rs`；
- `crates/routa-server/src/api/sessions.rs`；
- `crates/routa-server/src/application/sessions.rs`；
- `/api/acp` 和 `/api/sessions` 路由；
- Session history、context、fork、disconnect、delete、rename；
- `acp_sessions` 数据表；
- `parentSessionId` / `parent_session_id`；
- ACP process manager、Session SSE 和 ChatPanel。

主菜单删除不应引起以下变化：

- ACP Session 仍然可以创建、发送 prompt、流式接收事件和恢复；
- Session 仍然可以持久化到 SQLite/本地存储；
- Session tree、Agent/Task 关联和普通 ROUTA/CRAFTER/GATE 流程保持不变；
- API route、静态 route fallback 和数据库 schema 不因菜单隐藏而删除。

## 5. Kanban 隔离边界

按照本任务约束，Kanban 侧完全不修改，包括：

- `src/app/workspace/[workspaceId]/kanban/`；
- `src/core/kanban/`；
- `src/app/api/kanban/`；
- `crates/routa-server/src/api/kanban.rs`；
- `crates/routa-server/src/api/tasks_automation.rs`；
- Kanban 的 ACP Session 创建、任务 Session 恢复、lane session、ChatPanel 和 Agent Viewer；
- `kanban-planning` MCP profile、任务自动化和看板 SSE；
- Kanban 测试、快照和相关类型。

调查中发现 Kanban 当前仍有显式 Session URL/API 引用。这些引用不在本轮修改范围内；它们说明未来若
要删除 Session 详情面板，需要先由 Kanban 独立任务提供或确认等价的内部 Viewer，再移除旧路由。
本轮只隐藏主菜单，不通过修改 Kanban 链接来规避该问题。

## 6. 首页、Onboarding 和非主菜单入口

以下入口不属于左侧主菜单，默认保留：

- `src/app/page.tsx` 的 Sessions Surface；
- 首页最近 Session 列表及 Session 详情链接；
- `?mode=session` 到 Sessions 页的跳转；
- `src/client/components/home-page-sections.tsx` 的 `SESSION` onboarding mode；
- `src/client/utils/onboarding.ts` 的 `SESSION` 类型和偏好存储；
- `src/client/components/home-input.tsx` 的普通 Session 创建和跳转。

如果产品最终意图是“所有用户可见的 Session 入口都隐藏”，需要另一个明确范围：那将同时涉及首页、
Onboarding、HomeInput、Session route、深链接和 Kanban Viewer，不应在“只删除主菜单”的本轮执行。

## 7. 测试影响

本轮预计只需更新主导航相关测试：

- `src/client/components/__tests__/desktop-sidebar.test.tsx`：不再断言 Sessions，保留 Home/Kanban；
- 若存在 Desktop Nav Rail 测试，同步移除 Sessions 断言并保留 Kanban 断言；
- 若删除 Desktop 托盘 Sessions 项，再更新 `apps/desktop/src-tauri/src/tray.rs` 的菜单路由测试。

本轮不删除或重写以下测试：

- Session 列表/详情页测试；
- ACP、Session API、history/context/fork/disconnect 测试；
- ChatPanel、SessionContextPanel、TracePanel 测试；
- Kanban 测试和 Kanban source-contract 测试。

## 8. 实施顺序建议

1. 检查工作树，确认没有未识别的导航修改。
2. 删除 `desktop-sidebar.tsx` 和 `desktop-nav-rail.tsx` 的 Sessions item。
3. 如产品确认托盘属于“主菜单”，再删除 `tray.rs` 的 Sessions item；否则保持不变。
4. 更新导航测试，确保 Home、Kanban、Settings 和 Workspace 切换不受影响。
5. 搜索 `/workspace/*/sessions`、`/api/sessions` 和 `sessionId` 引用，确认没有因为导航删除而误删
   页面、API、ACP 或 Kanban 代码。
6. 执行主导航定向测试和 TypeScript 类型检查；不执行或修改 Kanban 代码。

## 9. 验收标准

- Web 左侧 Sidebar 不再显示 Sessions；
- Desktop Nav Rail 不再显示 Sessions；
- Kanban 菜单仍显示，href 和 active state 不变；
- Home、Settings、Workspace 切换行为不变；
- Session 页面、详情页、ACP、Session API 和存储仍然存在；
- 首页、HomeInput、Kanban 和其他内部 Session 入口没有被本轮改动；
- 不修改 `src/core/kanban/`、Kanban API、Kanban 自动化、Kanban 测试或 MCP profile；
- 不修改 CLI、Team runtime、数据库 schema、历史数据或文档。

本次调查报告不代表已经执行删除；当前只完成范围分析和边界确认。
