# Kanban 使用指南

本文从最终使用者的角度说明 Routa 的 Kanban 模式。重点是如何在桌面应用中准备工作区、关联项目、创建卡片、观察自动工作流，以及如何验证 Agent 是否按预期工作。

## 1. Kanban 是什么

Routa 的 Kanban 不只是一个任务列表。卡片所在的列代表任务当前的工作流阶段。创建卡片或进入新列会触发该列配置的 Agent；Agent 完成当前列后，会通过 `move_card` 自动推进卡片。

- 卡片的真实位置由 `columnId` 表示。
- `status` 是根据列阶段同步出的状态，不是另一套独立的看板分组。
- 创建卡片或进入自动化列会创建 Agent session（前提是该列启用自动化）。
- 列之间的移动会留下工作流事件和任务历史。
- Review、Done 等列可以配置质量门禁，缺少必要证据时不能直接推进。

典型流程是：

```text
Backlog -> Todo -> Dev -> Review -> Done
               \-> Blocked
```

`Blocked` 用于人工处理阻塞问题，默认不是自动化执行列。

## 2. 界面呈现：泳道视图

当前 Kanban 页面采用泳道（Swimlane）布局：**每个 Issue 独占一行**，横向流动表示状态流转。

```text
| backlog | todo |  dev   | review | done |
|---------|------|--------|--------|------|
| Issue A |      |        |        |      |
| Issue B |      | (card) |        |      |   <- B 在 dev 列
| Issue C |      |        |        |      |
```

- 若有 N 个 Issue，从上往下有 N 行泳道；每行复用完全相同的列集合。
- 卡片的真实位置仍由 `columnId` 决定，泳道只是呈现层——卡片"在哪一列"的语义不变。
- 行序按卡片创建时间（`createdAt`）排序，先创建的在上。
- 每行是一个独立的小 Board：列头在每行重复出现，行内横向滚动，行与行之间纵向滚动。
- 拖拽换列的交互与单 Board 时代一致：把卡片拖到同一行的另一列即触发 `move_card`。

### 空态

- 没有 board（首屏加载中 / 请求失败 / 确实无 board）：页面显示 "No board available yet."。
- 有 board 但没有任何 Issue：泳道区域渲染一个空的 Board，只显示列头。

### 使用者的影响

- 视觉上从"所有卡片纵向堆在一个 Board"变为"每个 Issue 一行"。
- 排查某张卡片时，直接定位到它所在的那一行即可，不需要在同一列的多张卡片中翻找。
- 大量 Issue 时纵向滚动会变长，这是当前接受的代价；行高等于卡高。

## 3. 使用前准备

开始 Kanban 工作前，需要完成以下准备：

1. 启动 Routa 桌面应用。
2. 创建或选择一个 workspace。
3. 配置至少一个可用的 Agent Provider，并完成所需认证。
4. 在当前 workspace 中添加一个本地项目或克隆一个 GitHub 项目。
5. 确认项目是可访问的 Git 仓库，并且 Routa 对它有读写权限。

首次验证建议使用一个小型项目，例如 `sample-todo`，并单独创建一个 `kanban-demo` workspace。这样不会把验证任务混入其他真实工作。

## 4. 创建 workspace 和添加项目

### 创建 workspace

在首页或 workspace 切换菜单中选择“新建 workspace”，输入名称并创建。创建后，Routa 会将它作为当前工作区。

### 添加项目

有两种常见入口：

- 首页配置区的“代码库”卡片
- 当前 workspace 的“设置 -> 关联仓库”

在仓库选择器中可以：

- 选择本地已有的 Git 项目目录
- 输入或选择 GitHub 仓库并执行克隆

保存后，项目就成为当前 workspace 的一个 codebase。这个操作只是登记项目路径和相关元数据，不会把本地项目复制进 Routa。

### 一个 workspace 可以有多个项目

可以。例如：

```text
电商项目 workspace
  - shop-web
  - shop-api
  - shop-infra
```

添加多个项目后，Kanban 页面顶部的仓库控制区域可以切换当前查看的项目。创建卡片时，卡片表单中的“关联仓库”区域可以选择一个或多个 codebase。

如果卡片没有明确选择仓库，当前产品语义可能会将 workspace 下的所有关联仓库作为任务上下文。因此，执行真实任务时应明确选择目标仓库。

多个 Agent 不应同时直接修改同一个物理目录。需要并行工作时，应使用独立 Git worktree；否则应让任务在同一目录中串行执行。

## 5. 创建一张 Kanban 卡片

进入当前 workspace 的 Kanban 页面，选择创建任务。卡片应尽量在开始时写清楚：

- 任务标题
- 目标和范围
- 验收标准
- 验证命令
- 测试场景
- 优先级和标签
- 关联的仓库

不要只写一句“把这个功能做出来”。Kanban 的后续列会根据卡片内容判断是否具备执行和交付条件。

## 6. 每个列应该做什么

| 列 | 使用者期望 | 典型结果 |
| --- | --- | --- |
| Backlog | 澄清需求，不急于写代码 | 范围、验收标准、验证计划完整 |
| Todo | 确认依赖和执行上下文 | 目标仓库、Provider、worktree 已明确 |
| Dev | 实现功能并运行测试 | 代码变更、测试结果、Git commit |
| Review | 检查质量和验收证据 | QA 结果、截图、测试证据、评审结论 |
| Done | 确认可以交付 | 提交状态、工作区状态、交付报告 |
| Blocked | 记录阻塞并等待处理 | 阻塞原因、恢复条件或 handoff 记录 |

### Backlog

Backlog Agent 的主要职责是整理需求，而不是直接开始大范围开发。它应确认：

- 任务范围是什么
- 验收标准是什么
- 如何验证
- 是否存在依赖或风险

完成后，Backlog Agent 会自动调用 `move_card` 进入 Todo。推荐配置还将 Backlog 的 `autoAdvanceOnSuccess` 设为 `true`，作为成功完成后的系统兜底推进。使用者不需要拖动卡片，只需检查卡片位置和 session 状态。

### Todo

Todo 阶段用于准备执行：确认仓库、分支、依赖、worktree 和执行角色。Todo Agent 完成后会自动调用 `move_card` 进入 Dev。

### Dev

Dev Agent 负责修改代码、运行验证并形成可审查的变更。进入 Review 前，应至少完成：

- 代码已修改
- 测试已运行
- 验证结果已记录
- 变更已提交，或已明确说明为什么不能提交

从 Dev 开始，任务描述通常应保持稳定，后续进展使用 comment、artifact 或验证报告记录。

### Review

Review 可能包含多个质量检查步骤，例如 QA 和 Review Guard。当前推荐配置通常要求测试结果和截图等证据。缺少这些证据时，Agent 的 `move_card` 调用可能被服务端门禁阻止，或留下明确的 warning，取决于列配置。

### Done

Done 表示满足交付条件，而不只是 Agent 说“完成了”。如果列配置了对应策略，还需要满足：

- 已提交代码
- worktree 状态符合要求
- 验收标准全部通过
- 分支具备交付或 PR-ready 条件

## 7. 推荐使用案例

使用一个已经添加到 `kanban-demo` workspace 的小型 `sample-todo` 项目，完成下面的需求：

> 增加 `GET /health` 接口。接口返回 HTTP 200，并返回 `{ "status": "ok" }`。为接口增加自动化测试，并提供一次运行验证的证据。

### 操作步骤

1. 在 Kanban 页面创建卡片，关联 `sample-todo`。
2. 把需求、验收标准和验证命令写入卡片。创建后不要手动拖动卡片。
3. 观察 Backlog Agent 是否自动启动并补全任务信息，然后自动推进到 Todo。
4. 观察 Todo Agent 是否自动确认执行仓库和依赖上下文，并自动推进到 Dev。
5. 等待 Dev Agent 自动实现接口、增加测试并提交变更，然后观察它是否自动推进到 Review。
6. 检查 Review Agent 的测试结果、截图和评审结论；门禁通过后观察卡片是否自动进入 Done。
7. 打开卡片详情，确认列位置、任务状态、lane session、变更记录和验证证据都能追溯。

### 验收标准示例

- `GET /health` 返回 HTTP 200。
- 响应内容包含 `status=ok`。
- 自动化测试覆盖成功响应。
- Git 变更属于 `sample-todo`，没有修改其他仓库。
- Review 阶段能看到测试结果和必要的截图证据。
- Done 阶段的提交和 worktree 状态符合当前列策略。

## 8. Rust-only 桌面运行面的注意事项

在最终 Tauri 桌面运行面中，Rust/Axum 负责 Kanban API、卡片创建和列变更、列进入时的 Agent 触发、任务持久化和 ACP 持久化。默认流程也是自动的：创建卡片后触发当前列 Agent，Agent 在当前列完成后调用 `move_card` 推进，下一列 Agent 随后自动启动。

推荐配置中只有 Backlog 的 `autoAdvanceOnSuccess` 默认开启；Todo、Dev、Review、Done 主要由当前 lane Agent 显式调用 `move_card` 推进。这不是人工流程，也不是关闭自动化，而是避免 Agent 推进和系统完成事件重复推进。

验证自动推进时，使用者只创建 Issue，然后观察：

```text
创建 Issue
  -> 当前列自动化 session
  -> Agent 调用 move_card
  -> 下一列自动化 session
  -> ...
  -> Done
```

使用者只在门禁拒绝、Agent 失败/超时或需要进入 `Blocked` 时人工介入。不要通过手动拖动卡片来代替自动推进验证。

## 9. 如何判断验证成功

不要只看卡片是否换列。建议同时检查：

1. **状态**：`columnId`、`status` 和列阶段是否一致。
2. **自动化**：进入自动化列后，是否创建了正确的 Provider、role 或 specialist session。
3. **门禁**：缺少测试结果、截图、提交或必要字段时，是否被正确阻止。
4. **追溯**：卡片详情中是否能看到 session、comment、artifact、变更和验证记录。
5. **恢复**：Agent 失败、超时或应用重启后，任务是否仍能恢复；进入 Blocked 后是否不会误启动自动化。

### 终态与 Blocked 分支检查

手工验证自动推进时，还要确认正常流程和异常旁路没有被混成一条线性序列：

- 正常流程应为 `Backlog -> Todo -> Dev -> Review -> Done`。
- `Done` 是终止列。Done Agent 完成后不应再计算下一列，也不应继续调用 `move_card`。
- `Blocked` 保留为看板中的人工处理列，但不应作为 `Done` 的下一个列或正常 successor。
- Agent 失败、超时、门禁拒绝、缺少依赖或需要人工暂停时，才应进入 `Blocked`。
- 进入 `Blocked` 时，应能看到阻塞原因和恢复条件；`Blocked` 列不应自动启动新的 Agent。
- 从 `Blocked` 恢复时，应显式指定目标列，不应依赖列的视觉顺序推断恢复位置。

本项的关键验收结果是：正常完成的卡片停在 `Done` 并同步为 `COMPLETED`；只有存在明确阻塞证据的卡片才停在 `Blocked` 并同步为 `BLOCKED`。

## 10. Agent 收到的 Prompt 构成（内部机制）

本节从实现角度说明：卡片进入自动化列后，被触发的 Agent 实际收到什么。使用者不需要记住细节，但它解释了 Agent 行为的边界，排查"Agent 为什么这么做"时有用。

### 触发链路

```text
卡片进入 type=auto 的列（move_card / 卡片创建 / 批量同步）
    -> processKanbanColumnTransition / trigger_assigned_task_agent
    -> 读取当前列的 automation.steps[0].specialistId（如 "kanban-dev-executor"）
    -> startKanbanTaskSession / trigger_assigned_task_acp_agent
    -> create_session(tool_mode="full", mcp_profile="kanban-planning", specialistId=...)
    -> 加载 Specialist System Prompt（按 specialistId 从 YAML 文件加载）
    -> buildTaskPrompt() 拼装任务上下文
    -> 拼接: specialistSystemPrompt + "\n\n---\n\n" + taskPrompt
    -> acp_manager.prompt() 作为首条 user message 发出
```

A2A 类型的列共用同一个 prompt 拼装结果，只是投递方式换成 A2A `SendMessage`。

### Prompt 内容

Agent 收到的全部内容是一个字符串，由两部分拼接而成：

```
┌─────────────────────────────────────────────────────────┐
│ Part 1: Specialist System Prompt                        │
│    (resources/specialists/workflows/kanban/xxx.yaml)     │
│                                                         │
│    按列选择不同的 YAML 文件：                             │
│    - backlog -> backlog-refiner.yaml                     │
│    - todo    -> todo-orchestrator.yaml                   │
│    - dev     -> dev-executor.yaml                        │
│    - review  -> review-guard.yaml                        │
│    - done    -> done-reporter.yaml                       │
│                                                         │
│    以 dev-executor.yaml 为例：                           │
│    - Mission: 实现功能、更新卡片、提交代码               │
│    - Entry Gate: 验证上游质量（6项检查表）               │
│    - Card Body Additions: Dev Evidence 格式要求          │
│    - Exit Gate: 预检 Review 的 Entry Gate（9项自检）     │
│    - Required behavior: 10条强制规则                     │
│    - Verification safety: 5条安全验证规则                │
├─────────────────────────────────────────────────────────┤
│ 分隔符: "\n\n---\n\n"                                    │
├─────────────────────────────────────────────────────────┤
│ Part 2: buildTaskPrompt() 输出                           │
│    (src/core/kanban/agent-trigger.ts)                   │
│                                                         │
│    - "You are assigned to Kanban task: {title}"         │
│    - ## Context: 硬约束（禁止扩大范围等）                 │
│    - ## Task Details: Card ID, Priority, 列信息等        │
│    - ## Objective: 卡片原始内容                          │
│    - ## Story Readiness: 代码计算的字段缺失状态           │
│    - ## INVEST Snapshot: 代码计算的启发式评分             │
│    - ## Artifact Gates: 当前列和下一列的 artifact 要求   │
│    - ## Delivery Gates: 提交/清洁工作树/PR-ready 要求    │
│    - ## Dev Verification Safety: Dev 列特有安全规则      │
│    - ## Available MCP Tools                              │
│    - ## Instructions: 编号规则                           │
└─────────────────────────────────────────────────────────┘
```

### 关键特性

- **Specialist System Prompt 在最前面**：定义了该列 Agent 的角色、行为规范和质量标准。每个列有独立的 YAML 文件，内容完全不同。
- **buildTaskPrompt() 是硬编码模板**：`src/core/kanban/agent-trigger.ts:255`，同一列内所有卡片共享同一外壳，仅插值字段（标题、objective、列信息等）不同。
- **Story Readiness / INVEST 是代码计算**：`src/core/kanban/task-derived-summary.ts` 在发送前检查字段是否存在（`scope.length > 0` 等），作为上下文注入，**不是 LLM 生成**。
- **Gate 只检查字段存在，不检查质量**：`move_card` 的服务端检查仅验证字段非空，内容质量依赖 LLM 自律（system prompt 指令）和后续列的人工检查。
- **move_card 返回具体错误信息**：如 `missing required task fields: scope, acceptance criteria`，LLM 可据此精确补充缺失字段后重试。
- **多轮对话机制**：LLM 调用 `update_task` 补充字段 → 调用 `move_card` → 若 gate 失败收到具体错误 → 继续补充 → 再次尝试，直到成功。
- **Session 使用 `kanban-planning` profile**：裁剪工具目录，没有 `delegate_task_to_agent` 等委托工具，Agent 不能在列内再派生子 Agent。
- **卡片 objective 是核心输入**：Specialist Prompt 提供处理规范，objective 提供具体内容。objective 写得含糊时，Agent 会按规范要求补充完善（如 Backlog 列要求补充 Test Case）。

### Specialist 加载机制

Specialist 定义在 YAML 文件中，遵循 ADR 0005 定义的加载链。但**开发规范要求：必须通过改代码重新编译的方式修改 Specialist，不允许使用 `~/.routa` 覆盖，不允许使用数据库覆盖**。

原因如下：

**1. 数据库方案（当前不可用）**

数据库方案设计上是全局覆盖（`specialists` 表没有 `workspaceId` 字段），但当前实现不完整：
- Web 端：前端调用 `/api/specialists`，但 `src/app/api/` 下没有对应的路由文件
- Desktop 端：Rust API 路由存在，但 POST/PUT/DELETE 都返回 501 Not Implemented
- Rust 端加载器完全不走数据库，只从文件系统加载

**2. `~/.routa` 方案（不允许使用）**

`~/.routa/specialists/` 是用户级全局配置，与改代码重新编译在影响范围上没有区别（都是全局生效）。使用它会引入不可追踪的运行时差异，破坏"代码即真相"的原则。

**3. 改代码重新编译（唯一允许的方式）**

修改 `resources/specialists/workflows/kanban/dev-executor.yaml` 后重新编译打包，是唯一被允许的方式。这确保：
- 所有变更都在版本控制中可追踪
- 所有环境（开发、测试、生产）使用相同的 Specialist 定义
- 没有隐藏的运行时覆盖导致行为不一致

每个 Specialist 是一个独立的 YAML 单文件（如 `dev-executor.yaml`），包含完整的 `system_prompt` 字段。没有多文件拼装机制，但存在 locale overlay（如 `locales/zh-CN/workflows/kanban/dev-executor.yaml` 在中文环境下替换英文版本）。

### 列间差异机制

`buildTaskPrompt()` 是所有列共用的模板函数，内部通过 `currentColumnId` 做条件分支，实现列间差异。这不是"池"模式（没有注册表或配置数组），而是**过程式的条件组装**：每个段落是一个 `condition ? [内容] : []` 的三元表达式，最终用 `...spread` 按固定顺序拼装，空数组展开后等于没插入。

以 Dev 列为例，特有段落和差异点：

**1. Dev Verification Safety（仅 Dev 列注入）**

```typescript
// agent-trigger.ts:447
const devVerificationSection = currentColumnId === "dev"
  ? ["## Dev Verification Safety", "", "Verify frontend changes against...", ...]
  : [];  // 非 dev 列时为空数组，展开后消失
```

**2. Available MCP Tools 差异**

Backlog 列有 `search_cards`、`create_card`、`decompose_tasks`、`confirm_feature_tree_story_context`；非 Backlog 列（含 Dev）没有这些，但有 `request_previous_lane_handoff` 和 `submit_lane_handoff`。

**3. Instructions 差异**

Backlog 有 12 条指令（侧重规划），非 Backlog 有 8 条（侧重执行）。Review 列的第 6 条会变为 handoff 相关指令。

**4. Lane Run History / Lane Handoff（仅非 Backlog 列）**

```typescript
// agent-trigger.ts:411, 423
const laneRunHistorySection = !isBacklogPlanning && previousLaneRun ? [...] : [];
const laneHandoffSection = !isBacklogPlanning && (previousLaneSession || pendingLaneHandoffs.length > 0) ? [...] : [];
```

**5. requiredTaskFields 差异**

Dev 列在 `boards.ts:248` 被配置为 `["scope", "acceptance_criteria", "verification_plan"]`，而 Backlog 列使用全部 6 项。这影响 `Story Readiness` 段落中检查的字段范围。

**6. Dev 列特有配置**

| 配置项 | 值 | 位置 |
|--------|-----|------|
| `specialistId` | `kanban-dev-executor` | `boards.ts:50` |
| `role` | `CRAFTER` | `boards.ts:49` |
| `autoAdvanceOnSuccess` | `false` | `boards.ts:54` |
| `requiredTaskFields` | `scope, acceptance_criteria, verification_plan` | `boards.ts:248` |

### Dev Column 的 Entry Gate 和 Exit Gate

Dev Crafter 的 Specialist Prompt 定义了两道质量门：

**Entry Gate**（验证上游 Todo 的输出质量）：
- Canonical YAML story block 存在且有效
- `## Acceptance Criteria` 存在且可测试
- `## Execution Plan` 存在且有具体步骤
- `## Key Files & Entry Points` 标识了工作位置
- `## Dependency Plan` 明确说明可以开始或有阻塞前提
- 范围清晰到可以在 5 分钟内开始编码

任何一项失败，Agent 会调用 `update_card` 写 Rejection Notes，然后 `move_card` 回 `todo`。

**Exit Gate**（预检 Review 的 Entry Gate，9 项自检）：
- `## Dev Evidence` 部分已写
- 变更文件已列出
- 每个 AC 都有验证记录
- 测试已运行并记录结果
- 代码已提交到 git
- `git status` 干净
- 无范围蔓延
- Lint/类型检查通过
- 无 Entrix 文件预算违规

全部通过后才调用 `move_card` 到 `review`。此外，Review 列配置了 `deliveryRules`（`requireCommittedChanges: true, requireCleanWorktree: true`），`move_card` 时服务端会强制检查。

## 11. workspace 的清理和删除

当前用户界面没有提供删除 workspace 的按钮。

可以在“Workspace 设置 -> 关联仓库”中移除仓库，但这只会解除 codebase 关联，不会删除 workspace 下的任务、会话、看板或 artifact，也不是“一键清空”。

当前行为可以概括为：

```text
可以创建 workspace
可以切换 workspace
可以添加或移除关联仓库
可以暂时停用某个 workspace
暂时不能在界面中永久删除 workspace
```

因此，功能验证最好使用专用的临时 workspace，例如 `kanban-demo`，验证完成后保留它或移除其中的仓库。永久删除属于破坏性操作，需要产品提供明确的确认、归档和恢复流程后再开放。

## 12. 常见问题

### 页面一开始显示没有 board

首屏加载期间可能暂时显示空状态。先等待 Rust 服务和数据库初始化完成，再确认 Kanban 页面是否加载默认 board。应区分加载中、请求失败和确实没有 board 三种情况。

### 卡片进入列后没有启动 Agent

检查当前列是否启用了自动化、Provider 是否已认证、仓库路径是否有效，以及任务是否已经有正在运行的 lane session。`Blocked` 列默认是人工列，不会自动启动 Agent。

### 多张卡片同时进入 Dev

Kanban 会使用队列和并发限制控制 Agent 数量。即使界面上有多张卡片，也不意味着它们会无限并行执行。若任务修改同一个目录，必须使用 worktree 或改为串行。
