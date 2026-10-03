# Team

本文记录 Routa 当前 Team 功能的实际定位、运行链路、界面行为和实现边界。
内容基于 2026-09-29 的源码、Rust API 和本地开发界面核对，描述当前实现事实，
不把 Team 解释成泛化的团队成员管理或多人聊天功能。

## 1. 功能定位

Team 是 Routa 的工作区级、Lead 驱动的多 Agent 协作模式：

```text
用户需求
    -> Team Lead（team-agent-lead）
        -> 创建任务
        -> 委派真实子会话
        -> 汇总结果
        -> QA / Code Reviewer 验证
        -> 决定下一波或结束
```

Team 适合以下工作：

- 一个任务跨越前端、后端、研究、QA、评审等多个专业方向；
- 需要并行执行，但必须显式控制任务边界和冲突；
- 协调、验证和结果汇总本身就是任务的一部分；
- 一个 workspace 内涉及多个 codebase 或多个子系统。

Team 不等同于：

- 持久化的人类团队/成员目录；
- 普通多人聊天或共享会话；
- Kanban 看板流程；
- 预先创建全部 Agent 的固定工作组；
- 定时任务或后台 DAG 工作流。

## 2. 界面入口

桌面左侧主导航包含 Team，入口为：

```text
/workspace/:workspaceId/team
```

导航实现位于 `src/client/components/desktop-sidebar.tsx`。

Team 首页由 `src/app/workspace/[workspaceId]/team/team-page-client.tsx` 实现，包含：

- 当前 workspace 标题和 Team Lead 启动说明；
- Team Run 数量、活跃数量和可用成员数量；
- Team Bench：从 Specialist Catalog 中筛选 `team-*` Specialist；
- 共享输入框，用于输入需求、选择仓库并创建 Team Lead Session；
- 右侧 Team Runs 列表，只显示顶层 Team Lead Runs。

Team Bench 当前显示 9 个 Specialist：

```text
Agent Lead
Research Analyst
Frontend Dev
Backend Developer
QA Specialist
Code Reviewer
UX Designer
Operations Engineer
General Engineer
```

其中 Agent Lead 不计入可用成员数，因此首页通常显示 8 个 members。

Team Run 详情页入口为：

```text
/workspace/:workspaceId/team/:sessionId
```

详情页实现位于 `src/app/workspace/[workspaceId]/team/[sessionId]/`，用于查看一次运行的协调过程。

## 3. Team Run 启动条件和入口行为

Team 首页复用 `HomeInput`，但配置被固定为：

- `defaultAgentRole: ROUTA`；
- `lockedSpecialistId: team-agent-lead`；
- 禁止切换普通角色；
- 禁止选择任意自定义 Specialist；
- 必须选择仓库；
- 创建 Session 后使用 pending-prompt 流程；
- 创建成功后跳转到 `/workspace/:workspaceId/team/:sessionId`。

相关配置位于：

```text
src/app/workspace/[workspaceId]/team/team-page-client.tsx
src/client/components/home-input.tsx
```

`HomeInput` 创建 Session 时会提交：

- workspace ID；
- repository path / branch；
- provider、model；
- `specialistId = team-agent-lead`；
- `role = ROUTA`。

在 Tauri 静态运行面，前端通过 `desktopAwareFetch` 将 API 请求发送到默认的
`http://127.0.0.1:3210` Rust/Axum 服务。纯 `localhost:3110` 的 Next.js HTTP 开发页
如果没有配置 backend base URL，则会使用相对 `/api`，不能代表最终 Tauri 运行面。

## 4. Team Lead 的实际职责

Team Lead 的 canonical 配置是：

```text
resources/specialists/team/agent-lead.yaml
```

它的角色为 `ROUTA`，但和普通 ROUTA Coordinator 不是同一个 Specialist。
提示词要求 Team Lead：

1. 接收需求并拆解为任务；
2. 上下文不清楚时优先委派 Researcher；
3. 为每个 Agent 分配一个清晰、互不重叠的工作；
4. 允许独立范围的工作并行，存在文件冲突风险时串行；
5. 保持小规模 active waves，默认最多 3 个活跃成员；
6. 实现完成后委派 QA 或 Code Reviewer；
7. 要求验证证据，不能只依据口头完成声明；
8. 在一波完成后回到 Lead，再决定下一波；
9. 自己不写代码，执行工作只能通过委派完成。

Rust ACP route 在创建 `team-agent-lead` Session 时会注入该 Specialist 的 system prompt，
并将其 native tools 列表设置为空：

```text
crates/routa-server/src/api/acp_routes.rs
```

这表示 Lead 不能依赖本地原生编辑工具直接实现任务，而是通过 Routa MCP 协调能力工作。

## 5. 委派和子会话链路

Team Lead 使用 MCP 工具：

```text
delegate_task_to_agent
```

该工具的实际含义是“创建一个真实 Agent 进程并建立子 Session”，不是只创建数据库任务。
公开工具契约包含：

- `taskId`：待委派任务；
- `callerAgentId`：Lead Agent；
- `callerSessionId`：Lead Session；
- `specialist`：执行角色；
- `provider`、`cwd`；
- `additionalInstructions`；
- `waitMode`：`immediate`、`after_all` 或 `fire_and_forget`。

Rust 编排路径为：

```text
MCP delegate_task_to_agent
    -> crates/routa-server/src/api/mcp_routes/tool_executor/delegation.rs
    -> RoutaOrchestrator::delegate_task_with_spawn
    -> 创建 Agent record
    -> 创建带 parentSessionId 的 ACP 子会话
    -> 发送初始任务 Prompt
    -> 记录 delegation group / 状态
    -> 子 Agent 完成后唤醒 Lead
```

子 Session 的 `parentSessionId` 是 Team UI 识别会话树的关键字段。
Team 页面会读取 Lead Session 和所有后代 Session 的历史、SSE 更新和任务记录，
再生成成员状态、时间线和委派卡片。

### 5.1 Agent/Session 类型和持久化边界

当前没有独立的 `team_session`、`lead_session` 或 `session_type` 表/字段。
Agent 和 Session 使用统一实体模型，Team、Lead、Task、Auto 的语义通过多个字段和调用入口组合表达：

```text
Agent.role                  -> ROUTA / CRAFTER / GATE / DEVELOPER
Agent.parent_id             -> Agent 逻辑关系
Session.role                -> 协调者或执行角色标记
Session.parent_session_id   -> Session 树关系
Session.specialist_id       -> Specialist 配置（TypeScript 持久化层）
Task.session_id / trigger_session_id / creation_source -> Task 关联和来源
```

`role` 在数据库中是 `TEXT`，但业务代码会对 `ROUTA` 等值做语义判断。`ROUTA` 更接近
“协调者角色”，不是严格的 `type=lead`。Team Lead 的专用标记是
`specialist_id=team-agent-lead`；Team 页面还会结合根 Session 和 descendants 判断 Team Run。

Rust `acp_sessions` 表保存 `role`、`mode_id` 和 `parent_session_id`，没有 `type` 或
`specialist_id` 列。TypeScript/Next.js 的 SQLite schema 额外保存 `specialist_id` 和
`execution_mode`，但同样没有 `type` 列；其中 `execution_mode` 表示 `embedded/runner`
执行后端，不表示 `task/team/lead`。

Root Lead Session 在成功创建后会写入 `acp_sessions`，通常使用
`parent_session_id=NULL`。但是 Team MCP 的 `delegate_task_with_spawn` 直接通过
`AcpManager` 创建 child Session，并把关系放入编排器内存；当前没有同步调用
`AcpSessionStore::create`。因此服务器重启后，Team 委派产生的这类 child Session 不一定能从
SQLite 恢复，即使对应的 Agent/Task 记录仍然存在。

## 6. Team 首页和详情页数据

Team 首页请求：

```text
GET /api/sessions?workspaceId=<id>&surface=team
GET /api/specialists
```

Rust `GET /api/sessions` 在 `surface=team` 且没有 `parentSessionId` 时，会：

1. 建立 parent -> children 映射；
2. 只保留顶层 Session；
3. 识别显式 Team 标记（`specialistId=team-agent-lead`、`Team - ...` 等）；
4. 统计 `directDelegates` 和全部 `descendants`；
5. 防止循环 parent 链导致递归失控。

实现位于：

```text
crates/routa-server/src/api/sessions.rs
```

Team 详情页会并行读取：

```text
GET /api/sessions/:sessionId
GET /api/sessions?workspaceId=<id>
GET /api/sessions?workspaceId=<id>&surface=team
GET /api/agents?workspaceId=<id>
```

页面分为三个主要区域：

- 左侧：Objective、Plan Task Tree、Deliverables；
- 中间：Lead Session Timeline、委派事件、子会话消息和输入框；
- 右侧：Team Members、角色、状态、最近更新和消息预览。

成员可以点击后聚焦对应 Session，也可以打开独立的 Session Viewer。

## 7. 与 Sessions 和 Kanban 的区别

| 模式 | 编排起点 | 主要对象 | 适用场景 |
|---|---|---|---|
| Sessions | 一个可恢复的会话线程 | Session | 普通开发、探索、恢复已有工作 |
| Kanban | 看板列和任务状态 | Task / Card / Lane | 有固定交付门禁和阶段流转的工作 |
| Team | Lead + 子会话树 | Team Run / Session Tree | 跨专业、跨子系统、需要显式委派和验证的工作 |

Sessions 可以在运行过程中按需委派，但不预设 Team UI 和固定 Team Run 聚合。
Kanban 从列转换和自动化配置开始，不以 Lead 的动态委派树为主要对象。
Team 的核心不是“能力等级更高”，而是“编排从 Lead 委派树开始”。

## 8. 当前实现边界

### 8.1 Team Bench 不等于固定的运行时专家实例

Team Bench 展示的是 `team-*` Specialist Catalog。它不是启动时预先创建的 Agent roster。
Team Lead 只会为当前波次需要的任务创建成员。

同时，`delegate_task_to_agent` 的公开 schema 目前主要枚举：

```text
CRAFTER / GATE / DEVELOPER
```

Rust 编排器会把 `backend-dev`、`frontend-dev`、`qa` 等别名解析到这些通用角色；
TypeScript 编排器也有相同的角色解析路径。Team UI 会根据委派任务、工具调用和运行元数据
推断并展示 Research、Backend、QA 等 roster role，但显示的角色名不保证对应独立的后端执行器
或独立的 system prompt。

因此当前更准确的表述是：

```text
Team = Lead + 通用执行/验证角色 + 可追踪的真实子会话树
```

而不是“固定启动 8 个完全独立的领域专家”。

### 8.2 初始仓库选择不是完整的多仓库启动器

Team 启动时要求选择一个初始 repository。一个 workspace 可以持有多个 codebase，
Lead 也可以在协调过程中处理跨 codebase 的任务，但当前入口没有专门的多仓库编排选择器。

### 8.3 Rust-only 运行面不依赖 TypeScript Kanban 编排器

Team 是独立的 Session-tree 协调面。不能因为 TypeScript 中存在其他 orchestrator，
就推断它会自动承载 Team Run；桌面默认运行面由 Rust/Axum 的 ACP、MCP、Session 和
Orchestrator 负责。

### 8.4 文档路径存在轻微漂移

`docs/design-docs/execution-modes.md` 提到的
`docs/specialists/team/team-agent-lead.md` 当前不存在。实际生效的 canonical Team Lead
定义是：

```text
resources/specialists/team/agent-lead.yaml
```

### 8.5 Team Run 删除功能缺口

后端存在：

```text
DELETE /api/sessions/:sessionId
```

该接口会停止目标 Session 的内存进程，并删除对应的 `acp_sessions` 行。但当前 Team 首页和
Team 详情页都没有删除入口；普通 Sessions 页面又会主动过滤顶层 Team Run，因此用户无法从
现有 UI 菜单删除 Team Session。

删除接口目前是单 Session 删除，不会自动：

- 删除或停止 child Session；
- 调用 Team 编排器的 `cleanup`；
- 删除 `agents` 表中的 Agent；
- 清理关联 Task 或 delegation group；
- 级联处理 `parent_session_id` 子树。

因此当前删除语义尚未形成完整的 Team Run 生命周期管理。直接删除 Lead Session 可能留下
child Agent、Task、内存编排状态或运行中的 child process；这也是 Team 页面暂未暴露删除操作
时需要考虑的实现风险。

## 9. 本地核对结果

本次核对未启动新的 Team Run，避免创建 Agent 进程和修改运行状态。已确认：

- Team 菜单和 Team 首页可以打开；
- 显式指向 Rust API 时页面显示 `MCP ready`；
- Rust Specialist API 返回 9 个 `team-*` Specialist；
- `GET /api/sessions?workspaceId=default&surface=team` 返回 HTTP 200，当前为 `{ "sessions": [] }`；
- `GET /api/workspaces/default/codebases` 当前返回空数组，因此默认 workspace 没有可直接启动的 codebase；
- 未选择仓库时 Team 输入框的 Send 按钮保持禁用；
- Team 相关 Vitest 检查通过：6 个测试文件、20 个测试全部通过。

相关测试包括：

```text
src/app/workspace/[workspaceId]/team/__tests__/team-page-client.test.tsx
src/app/workspace/[workspaceId]/team/[sessionId]/__tests__/team-run-page-model.test.ts
src/client/components/__tests__/desktop-sidebar.test.tsx
```

## 10. 相关代码和文档

- `src/client/components/desktop-sidebar.tsx`
- `src/client/components/home-input.tsx`
- `src/app/workspace/[workspaceId]/team/team-page-client.tsx`
- `src/app/workspace/[workspaceId]/team/[sessionId]/team-run-page-client.tsx`
- `src/app/workspace/[workspaceId]/team/[sessionId]/team-run-page-sections.tsx`
- `crates/routa-server/src/api/acp_routes.rs`
- `crates/routa-server/src/api/mcp_routes/tool_catalog.rs`
- `crates/routa-server/src/api/mcp_routes/tool_executor/delegation.rs`
- `crates/routa-server/src/api/sessions.rs`
- `crates/routa-core/src/orchestration/mod.rs`
- `resources/specialists/team/agent-lead.yaml`
- `docs/design-docs/execution-modes.md`
- `docs/use-routa/team.md`
- `docs/product-specs/FEATURE_TREE.md`

## 11. 本轮删除范围（2026-10-02 澄清）

本轮只处理 Web/Desktop 的 Team 菜单和 Team 面板，不处理 Team 的底层运行能力。
具体边界如下：

### 11.1 本轮删除

- 左侧桌面导航中的 Team 菜单：
  `src/client/components/desktop-sidebar.tsx`、
  `src/client/components/desktop-nav-rail.tsx`。
- Workspace 页面 Header 中的 Team 按钮：
  `src/client/components/workspace-page-header.tsx` 及其调用方的 Team 回调。
- 首页中进入 Team 的 Surface 卡片、`?mode=team` 跳转和 Team onboarding 选项：
  `src/app/page.tsx`、`src/client/components/home-page-sections.tsx`、
  `src/client/utils/onboarding.ts`。
- Team 面板路由及其组件/测试：
  `src/app/workspace/[workspaceId]/team/`，包括 Team 首页和 Team Run 详情页。
- Desktop 托盘中的 “Team Runs” 菜单及其 `/team` 路由映射：
  `apps/desktop/src-tauri/src/tray.rs`。

删除这些入口后，Team API、Team Specialist 和 Team Session 运行能力暂时可以保留，
但不再从现有 Web/Desktop UI 暴露。

### 11.2 本轮明确不处理

- CLI Team 命令（`crates/routa-cli/`），CLI 另行处理。
- Team 后端 API、`surface=team` 投影、ACP Team Lead 分支、Orchestrator、MCP
  delegation、Team Specialist YAML 和相关运行时逻辑。
- `acp_sessions`、Agent、Task、`parent_session_id` 等数据和存储结构。
- 历史兼容、旧 URL 重定向、历史 Team Session 清理。本项目当前没有实际使用过 Team，
  因此本轮不设计历史迁移策略。
- Kanban 功能实现、Kanban 路由、Kanban API、Kanban 自动化和 Kanban MCP profile。

### 11.3 Kanban 保护边界

Kanban 是核心功能，本轮删除 Team 时必须保持以下内容不变：

- 左侧导航和首页中 `/workspace/:workspaceId/kanban` 的入口仍然存在；
- Onboarding 的 `KANBAN` 模式仍然可选、可保存和可恢复；
- `src/app/workspace/[workspaceId]/kanban/`、`src/app/api/kanban/` 和
  `src/core/kanban/` 的业务逻辑不修改；
- Rust Kanban 路由、任务自动化、看板/任务存储不修改；
- `kanban-planning` MCP profile、Kanban ACP Session 创建和列自动化不修改；
- `ROUTA`、普通 Session/ACP、`parentSessionId` 等共享能力不因移除 Team UI 而删除。

`desktop-sidebar.tsx`、`desktop-nav-rail.tsx`、`page.tsx`、
`home-page-sections.tsx` 等文件同时包含 Team 和 Kanban 入口，允许只删除 Team 分支；
不得顺手重构或调整 Kanban 分支。完成后应至少回归导航、首页、Onboarding 和 Kanban
页面/自动化相关测试。
