# Kanban Card / TaskDetail 执行状态调查记录

> 记录时间：2026-09-12
> 
> 目的：记录 Kanban Card 封面与 TaskDetail 对 Agent 执行状态、Run/Rerun 按钮和运行历史的现状调查，作为后续 UI 简化讨论的备份。
> 
> 本记录只描述现状和分析。本轮没有修改业务代码，也没有决定最终的状态模型。

## 一、调查范围

重点检查了以下内容：

- Card 封面上的状态徽标和 Run/Rerun 按钮。
- 点开 Card 后，TaskDetail 的 Execution 区。
- TaskDetail 的 Runs / Activity 区。
- Task、Lane Session、ACP Session 三类状态之间的关系。
- workspace `arknights` 中 TASK-300 的实际数据。

相关实现：

- `src/app/workspace/[workspaceId]/kanban/kanban-card.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-card-activity.tsx`
- `src/core/kanban/effective-task-automation.ts`
- `src/core/task-run-ledger.ts`
- `crates/routa-server/src/application/tasks.rs`
- `crates/routa-server/src/api/tasks_automation.rs`
- `crates/routa-server/src/api/kanban.rs`

## 二、Run / Rerun 的实际功能

Card 封面和 TaskDetail 最终都调用同一个 `onRetryTrigger(task.id)`。

后端收到 `retryTrigger: true` 后会：

1. 清除旧的 `triggerSessionId`。
2. 创建新的 Agent Session。
3. 使用当前 Lane/Card 的自动化配置启动 Agent。
4. 将新 Session 写入 `sessionIds` 和 `laneSessions`。
5. 将新 Session 设置为当前 `triggerSessionId`。

它不是恢复旧 Session，也不负责移动 Card、完成 Card 或直接执行测试。

因此两个名称表达的本意是：

- `Run`：首次手动启动当前 Card 的 Agent 自动化。
- `Rerun`：再次创建一个 Agent Session 执行当前 Card。

更准确的功能描述应接近 `Start Agent` / `Start New Agent`。只有在系统明确知道上一次运行失败时，`Retry Agent` 才是准确说法。

## 三、Card 封面的现状

Card 封面的状态徽标由 `linkedSession?.acpStatus` 和队列状态生成：

- `connecting` -> `STARTING`
- `ready` -> `LIVE`
- `error` -> `FAILED`
- 无状态 -> `IDLE`
- 有队列位置 -> `QUEUED #n`

封面按钮的显示逻辑：

```ts
canRetry = effectiveAutomation.canRun && (
  sessionStatus === "error"
  || (!task.triggerSessionId && task.columnId === "dev")
) && !queuePosition;

canRun = effectiveAutomation.canRun
  && !task.triggerSessionId
  && task.columnId !== "done"
  && !queuePosition;
```

封面按钮因此只有在以下条件下出现：

- 当前 Lane 或 Card 有可执行的自动化配置。
- Card 不在队列中。
- `Run` 还要求没有 `triggerSessionId`，且不在 `done`。
- `Rerun` 还要求 ACP 状态为 `error`，或者位于 `dev` 且没有 `triggerSessionId`。

封面不会显示按钮的常见情况：

- 已有 `triggerSessionId`。
- Card 正在排队。
- 没有可解析的 Lane/Card 自动化配置。
- Card 已在 `done`。
- Session 不是明确的 `error`，但已有残留 Session ID。

封面存在一个根本问题：它把 `triggerSessionId` 当作“仍有活动 Session”的充分条件，但状态徽标又只看 ACP 状态。因此可能出现：

```text
Task 有 triggerSessionId
ACP Session 没有有效 acpStatus
Card 显示 IDLE
Run 和 Rerun 都不显示
```

## 四、TaskDetail Execution 区的现状

TaskDetail 的 Execution 区使用更宽松的判断：

```ts
canRunTask = effectiveAutomation.canRun && task.columnId !== "done";
```

它不检查：

- `triggerSessionId` 是否存在。
- Session 是否真实运行。
- Session 是否已经失败。
- Card 是否排队。

所以只要当前 Lane 可执行，且不在 `done`，详情页就可能显示执行按钮。

TaskDetail 的按钮文案为：

```ts
needsLiveRunRecovery
  ? "Recover Live Run"
  : hasRecordedRuns
    ? "Rerun"
    : "Run";
```

这里的 `hasRecordedRuns` 只表示 `sessionIds` 中存在历史记录，不表示最近一次运行失败，也不表示当前 Session 已停止。因此：

- 从未启动过 -> `Run`
- 只要历史上启动过 -> `Rerun`
- 特定的 embedded ACP 恢复错误 -> `Recover Live Run`

这导致详情页和封面可能同时出现以下不一致：

- 封面没有按钮，详情页有按钮。
- 封面显示 `IDLE`，详情页按钮显示 `Rerun`。
- 详情页显示 `Rerun`，但最近一次运行其实仍是 `running`。

详情页只有在以下情况才显示失败提示：

- `sessionInfo.acpStatus === "error"` 且存在 `acpError`。
- 或 Task 上有 `lastSyncError`。

如果 Session 已停止、状态为空、运行记录残留为 `running`，但没有错误字段，详情页不会给出失败或停止原因。

详情页另外会展示：

- Lane Pipeline。
- Current Run 的 Provider、Role、Specialist 和 Transport。
- Card Session Override。
- Fallback Agent Chain。
- 当前/下一阶段所需的 Gate Artifacts。
- Evidence 状态，例如 `Review blocked`。

但这些信息目前没有统一驱动执行按钮的状态或文案。

## 五、TaskDetail Runs / Activity 区的现状

Runs Tab 会读取运行台账，并展示每次历史运行：

- `Running`
- `Completed`
- `Failed`
- `Timed out`
- `Transitioned`
- `Unknown`

每次运行可以显示：

- Run 序号。
- 类型：ACP、Runner ACP 或 A2A。
- 所属 Lane。
- Transport。
- Step / Specialist。
- Provider / Role。
- Session ID 或外部任务 ID。
- 工作目录或 A2A Context。
- 当前运行标志。

用户可以点击历史项切换到对应 Session，但 Runs Tab 没有提供：

- 停止 Session。
- 继续旧 Session。
- 标记为卡住。
- 将残留的 `running` 修正为停止/超时。
- 根据 Gate 阻塞原因决定下一步动作。

运行状态的推导同时使用 `laneSession.status` 和 ACP Session 状态。当两者不一致时，UI 可能继续显示 `Running`，或者退化为 `Unknown`，但没有明确的 `Stopped` / `Stuck` 状态。

## 六、TASK-300 实际案例

查询接口：workspace `arknights`，Card 标题为 `TASK-300：实现并本地验证 ActionsRuntime`。

实际数据：

- `columnId`: `dev`
- `status`: `IN_PROGRESS`
- Dev Lane automation: `enabled: true`
- `triggerSessionId`: `47112b07-74b6-4099-999f-3f3ce67c36ae`
- 当前 Lane Session: `running`
- Session `acpStatus`: `null`
- Session `continuityStatus`: `restorable`
- Session transcript: 空
- `lastSyncError`: `null`
- 运行历史总数：6
- 当前 Evidence：缺少 `screenshot`，因此 `requiredSatisfied: false`

因此当前界面逻辑会产生：

### Card 封面

```text
状态徽标：IDLE
Run：不显示，因为 triggerSessionId 存在
Rerun：不显示，因为 acpStatus 不是 error，且 triggerSessionId 存在
```

### TaskDetail Execution

```text
执行按钮：显示
按钮文案：Rerun，因为有历史 Session
失败说明：不显示，因为没有 acpError，也没有 lastSyncError
```

### TaskDetail Runs

```text
最新运行：Running
当前 Session：可被选中
运行历史：可查看 6 次
```

### Evidence / Gate

```text
Review blocked
缺少 screenshot 工件
```

但 Gate 阻塞没有改变 Execution 区的按钮文案，也没有产生 `Needs attention` 或类似状态。

## 七、核心问题总结

当前实际上有三套状态来源：

1. **Task 状态**：`status`、`columnId`、`triggerSessionId`。
2. **Lane 运行记录**：`laneSessions[].status`，例如 `running`、`timed_out`、`transitioned`。
3. **ACP Session 状态**：`acpStatus`，例如 `connecting`、`ready`、`error` 或空。

它们没有形成一个统一的“当前执行状态”。特别是：

- `triggerSessionId` 存在不等于 Session 仍在运行。
- `acpStatus` 为空不等于 Agent 已正常结束。
- `laneSession.status = running` 不等于运行时仍然活跃。
- 有历史运行不等于应该显示 `Rerun`。
- Evidence / Gate 阻塞不等于 Agent 失败，但当前 UI 没有把它作为独立的注意状态处理。

因此用户可能看到：

```text
Card：IDLE
TaskDetail：Rerun
Runs：Running
Session：无实际活动状态
Evidence：Review blocked
```

这正是“看不出来是停了，还是卡了”的根本原因。

## 八、对 Run / Rerun 的判断

当前 `Rerun` 把以下不同情况混在了一起：

- 上一次明确失败。
- Session 已停止但没有错误信息。
- Session 信息可恢复。
- 运行记录残留为 `running`。
- Agent 已完成工作，但因为 Gate 缺少工件无法流转。
- 用户只是想再次创建一个新的 Agent Session。

这些情况的用户动作并不相同：

- 明确失败：`Retry Agent`。
- 可恢复的旧 Session：`Continue Agent`。
- 已停止且不可恢复：`Start New Agent`。
- Gate 阻塞：先处理缺少的证据/工件，不应默认再次运行 Agent。
- 仍在运行：不应提供新的启动按钮，应该提供查看当前 Session。

所以当前 `Rerun` 不是一个可靠的状态名称，而只是“再次创建新 Session”的历史遗留文案。

## 九、当前简化讨论的建议边界

本记录不直接决定实现方案。后续若从简处理，至少需要先明确以下原则：

1. TaskDetail 是执行操作的唯一入口，Card 封面不承担复杂的运行控制逻辑。
2. 不把“有历史记录”直接等同于 `Rerun`。
3. 不把 `triggerSessionId` 直接等同于“正在运行”。
4. 对无法确认的状态，显示一个明确的未知/需处理状态，不能继续伪装成 `IDLE` 或 `Running`。
5. Gate 阻塞、Agent 失败、Session 停止和 Session 仍运行应至少在语义上区分。
6. 如果暂时不重构后端状态模型，按钮应被视为“启动一个新的 Agent Session”，而不是“重试当前运行”。

## 十、阶段性补充：Lane、Step、Session 与右侧 Tab

本节记录后续对 Detail 弹窗右侧 Session 展示的代码复查结果。讨论范围仍然是 Task 本身的执行记录，不把 Column 位置、Task.status、Evidence 或 Gate 判定混作执行状态。

### 10.1 一个 Lane 可以包含多个 Step，laneSession 是 Step 的执行记录

Lane 的自动化配置有有序的 `steps` 数组，语义是“在同一个 Lane 内按顺序执行的自动化步骤”。

真实测试场景：`task-steps-1` 从 Backlog 进入 Todo Lane 后：

1. 第一个 Session 执行 `triage`，`stepIndex: 0`，Session 为 `session-todo-1`。
2. 第一个 Session 完成后，Task 仍在 Todo Lane。
3. 编排器使用同一个 `columnId: "todo"` 创建第二个 Session，执行 `plan`，`stepIndex: 1`，Session 为 `session-todo-2`。

因此真实关系是：

```text
Todo Lane
  Step 1: triage -> Session todo-1
  Step 2: plan   -> Session todo-2
```

从实际业务语义看，`laneSession` 就是某个 Step 的一次执行记录：它以 `sessionId` 标识实际运行的 Session，同时保存该 Session 所属 Lane 的 `columnId/columnName` 和所执行 Step 的 `stepId/stepIndex/stepName`。

正常路径可以理解为：

```text
一个 Step 执行 -> 一个 Session -> 一个 laneSession
```

因此在理想执行场景下，Step、Session、laneSession 是一一对应的。严格从历史数据看，这不是永久的唯一约束：未执行的 Step 没有 laneSession；同一个 Step 在恢复或重试时可能产生新的 Session 和新的 laneSession。

### 10.2 右侧顶部 Tab 的真实单位和文案

右侧顶部按钮直接按 `task.laneSessions` 遍历生成，因此：

```text
一个 Tab = 一个 laneSession（即一个 Step 的一次 Session 执行记录）
Tab 文案 = 该记录的 Lane 文本 + Step 文本
```

Tab 不是按 Lane 去重的导航，也不是只展示 Lane 的导航。一个 Lane 内的每个 Step 执行记录都保留为独立 Tab。例如：

```text
Backlog · step1
Backlog · step2
Todo · step1
Dev · step1
Dev · step2
Dev · step3
```

目标设计移除 Lane 图标、计算序号和状态 Pill，使用文字 Tab。Lane 取 `columnName`，Step 取 `stepName`。`stepName` 缺失时不把 `stepId` 或计算出的 `Step N` 自动变成用户可见文案；应保留真实可用文本或明确处理为空的情况。

点击 Tab 后，下方选中信息区继续显示该 Session 的详细元数据。Tab 的 `title` 和无障碍描述可以包含完整的 Session 标识，但不改变可见标签的 Lane + Step 语义。

相关实现：

- `src/app/workspace/[workspaceId]/kanban/kanban-card-activity.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-card-session-utils.ts`
- `src/core/kanban/workflow-orchestrator.ts`

### 10.3 `selectedRunId` 与 `selectedLaneSession`

`selectedRunId` 虽然变量名包含 `Run`，实际保存的是当前选中 Tab 对应的 Session ID：

1. 如果传入的 `currentSessionId` 在 Tab 列表中，优先选它。
2. 否则选择 `orderedSessionIds` 的最后一个。

随后使用同一个 ID 查找两个对象：

```text
selectedLaneSession = task.laneSessions 中 sessionId 匹配的记录
selectedRun         = Run ledger 中 sessionId / id 匹配的记录
```

因此 `selectedLaneSession` 不是独立数据源，而是从 `task.laneSessions` 选出的当前 Session 历史记录。中栏顶部 Tab 本身只来自 `task.laneSessions`，不会由 Run ledger、`task.sessionIds` 或 `task.triggerSessionId` 补齐。

### 10.4 一条 `TaskLaneSession` 的字段

核心模型字段如下：

```text
sessionId

columnId / columnName
stepId / stepIndex / stepName

provider / role / specialistId / specialistName
transport

routaAgentId / worktreeId / cwd
externalTaskId / contextId

attempt / loopMode / completionRequirement / objective
lastActivityAt
recoveredFromSessionId / recoveryReason

status / startedAt / completedAt
```

其中：

- `columnId`、`columnName` 表示该 Session 所属 Lane。
- `stepId`、`stepIndex`、`stepName` 表示该 Session 执行的是 Lane 内哪个 Step。
- `transport` 表示 `acp` 或 `a2a` 等传输方式。
- `status` 是 LaneSession 自身的生命周期状态，例如 `running`、`completed`、`failed`、`timed_out`、`transitioned`。

### 10.5 Tab 下方标签行的字段映射

例如页面 DOM 中看到：

```text
Backlog / acp / Completed / Backlog Refiner / completed
```

它实际由五个独立渲染分支组成：

| UI 标签 | 数据来源 | 含义 |
| --- | --- | --- |
| `Backlog` | `selectedLaneSession.columnName` | 当前 Session 所属 Lane |
| `acp` | `selectedLaneSession.transport` | Session 的传输协议 |
| 第一个 `Completed` | `selectedRun.status` | Run ledger 的执行状态 |
| `Backlog Refiner` | `selectedLaneSession.stepName` | 当前 Session 的 Step 名称 |
| 第二个 `completed` | `selectedLaneSession.status` | LaneSession 自身状态 |

两个完成状态来自不同对象，但正常情况下通常相同，因为 Run ledger 的状态主要由 `laneSession.status` 推导。当前 UI 因此可能显示两个语义重复的 `Completed` 标签。页面视觉上的大写来自 CSS `uppercase`，不代表底层字段一定是大写。

### 10.6 当前阶段的简化模型

```text
Lane
  -> 有序 Step
  -> 每次 Step 执行产生一个 Session
  -> 每个 Session 进入 laneSessions 历史
  -> 每个 laneSession 对应一个右侧 Tab
```

因此，Lane 是执行所属的上下文，Step 是 Lane 内的执行定义，`laneSession` 是 Step 的一次执行记录。右侧 Tab 的数据实体是 `laneSession/Session`，但其业务显示语义是 `Lane + Step`。

### 10.7 右侧顶部 Tab 改造方案

只改右侧顶部的 `laneSession` 导航，不改变 `laneSessions` 数据模型、Session 创建流程、历史顺序或下方详情。

1. 使用真正的 Tabs 语义：容器为 `role="tablist"`，每个条目为 `role="tab"`，使用 `aria-selected`、`aria-controls` 和 `tabIndex`。
2. 复用项目现有的底部边框 Tab 设计：`border-b` 分隔线、`border-b-2` 选中指示、`desktop-border`、`desktop-bg-active`、`desktop-text-primary/secondary`、`desktop-accent`。
3. 可见文本固定为 Lane + Step：`columnName · stepName`。不使用 Icon Font，不显示 `index + 1`，不使用 `stepId` 或 `Step N` 作为未经确认的 fallback。
4. 保留 `task.laneSessions` 的数组顺序。默认不加入 `Backlog > Todo` 箭头；项目没有 Tab 专用箭头 token，且箭头会把 Session 历史误读为 Lane 面包屑。
5. Tab 选中态只表达“当前选中的 Session”，不再用 `running/completed/failed` 状态色改变整个 Tab 的外观；执行状态继续在下方详情区表达。

### 10.8 Session、Step 与 Run ledger 的关系澄清

本节进一步收敛“一个 Step 到底对应多少个 Session”和“Run ledger 是否是权威数据源”的语义。讨论范围是已经触发自动化的 Step 执行，不包含未执行或人工执行场景。

#### 10.8.1 一个已触发的 Step 会产生一个 Session

对一次具体的 Step 执行，系统会创建一个新的 Agent Session，并用新的 `sessionId` 记录这次执行：

```text
一次 Step 执行 -> 一个 Session
```

但这不意味着一个 Step 定义在整个生命周期内只能有一个 Session。相同 Step 再次执行、恢复或重试时，会创建新的 Session。准确基数关系是：

```text
Lane 1 -> N Step 定义
Step 定义 1 -> N Session 执行记录
一次 Step 执行 1 -> 1 Session
```

新 Session 不会替换旧 Session。TypeScript 的 `upsertTaskLaneSession` 只按 `sessionId` 查找既有记录：相同 `sessionId` 才会原地更新，不同 `sessionId` 会追加到 `task.laneSessions`。旧 Session 因此保留在历史中，新 Session 成为另一条历史记录。

#### 10.8.2 “当前 Session”是 Task 级指针，不是 Step 级字段

Task 只有一个 `triggerSessionId`，它表示当前任务正在触发或关联的 Session。`sessionIds` 保存任务关联的 Session ID 历史，`laneSessions` 保存带 Lane/Step 元数据的持久化执行历史。

模型没有为每个 Step 单独保存 `currentSessionId`。因此不能说“每个 Step 始终拥有一个 Current Session”；更准确的表达是：

```text
Step 的历史：task.laneSessions 中所有 stepId/stepIndex 对应的记录
Task 的当前指针：task.triggerSessionId
```

例如同一 Step 先后执行三次，历史中可以有三个 Session；只有其中一个可能被 Task 的 `triggerSessionId` 指向为当前 Session。旧记录仍然保留，不会被替换。

#### 10.8.3 `task.laneSessions` 的顺序不是严格时间排序契约

新增记录通常通过 `push` 放到 `task.laneSessions` 末尾，因此在正常串行自动化中，数组顺序通常等于 Session 创建顺序，也通常接近实际发生顺序。但模型没有声明该数组按 `startedAt` 严格排序：已有记录更新不会重新排序，导入、恢复或其他写入路径也可能影响插入顺序。

当前中栏顶部 Session 导航直接遍历 `task.laneSessions`，保留其数组顺序。它不使用 `getOrderedSessionIds(task)`，也不会在 `laneSessions` 为空时回退到 `task.sessionIds` 或 `task.triggerSessionId`。

#### 10.8.4 Run ledger 的定义和权威性边界

`Run ledger`（运行台账）是面向 API/UI 的运行历史读模型，不是另一种 Session，也不是独立的持久化实体。它在请求或构建时由以下信息整理得到：

```text
TaskLaneSession 历史记录
    + ACP Session 的补充元数据
    -> TaskRunInfo / TaskRunLedgerEntry
```

Run ledger 统一提供：

```text
id / sessionId
kind: embedded_acp | runner_acp | a2a_task
status: running | completed | failed | timed_out | transitioned | unknown
columnId / stepId / stepName
provider / specialistName
startedAt / completedAt
resumeTarget
```

TypeScript 实现位于 `src/core/task-run-ledger.ts`；Rust 的任务 Runs API 在 `crates/routa-server/src/api/tasks/evidence.rs` 中从 `task.lane_sessions` 动态构建同类结果。Run ledger 会按 `startedAt` 排序（通常最新在前），而不是复用 `task.laneSessions` 的原始数组顺序。

因此应区分三种角色：

```text
TaskLaneSession  = 权威的持久化执行历史及 Lane/Step 归属
Task.triggerSessionId = Task 级当前 Session 指针
Run ledger       = 运行历史的整理/排序展示投影
```

Run ledger 更适合作为 Runs UI、状态摘要和历史排序的数据源，但不能取代 `TaskLaneSession` 作为领域事实，也不能取代 `triggerSessionId` 判断 Task 当前指向的 Session。当前右侧上部的 Session Tab 如需表达历史实体，应以 `laneSession/session` 为实体；Run ledger 可用于补充状态和排序信息。

### 10.9 `laneSessions` 与 Task 级 Session fallback 的实际边界

本节只澄清当前代码路径，不把 Task 级 Session 关联混入 Kanban Lane 的执行模型。

#### 10.9.1 Lane 视角没有 Session fallback

Kanban Lane 的两个核心展示都只以 `task.laneSessions` 为来源：

```text
task.laneSessions
    -> Run ledger
    -> 中栏 Session Tabs
```

- Rust Runs API 从 `task.lane_sessions` 动态构建 Run ledger。
- 中栏 `KanbanCardActivityBar` 直接遍历 `task.laneSessions` 生成 Tab。
- `laneSessions` 为空时，中栏显示 `No automation runs yet`，不会使用其他 Session ID 生成 Tab。
- 因此在正常的 Kanban Lane 语义中，`laneSessions` 为空就表示没有 Lane 执行历史，这是正常空状态。

对于已有的 Lane 执行记录，当前对应关系是：

```text
一个 TaskLaneSession
    = 一个 Run ledger 条目
    = 一个中栏 Session Tab
```

三者使用同一个 `laneSession.sessionId` 标识同一次 Lane Step 执行。

#### 10.9.2 fallback 存在于哪些 Task 级辅助逻辑

`getOrderedSessionIds(task)` 的当前实现是：有 `laneSessions` 时返回其中的 `sessionId`；仅当 `laneSessions` 为空时，才回退到 `task.sessionIds + task.triggerSessionId`。这个 helper 用于：

- 左栏 Runs 历史列表的 ID 收集；
- TaskDetail 中 `activeRunSessionId` 的候选计算；
- Execution 区的 `hasRecordedRuns` 判断。

`getPreferredTaskSessionId(task)` 则按以下优先级选择打开 TaskDetail 时的默认 Session：

```text
triggerSessionId
    -> 最新 laneSession.sessionId
    -> 最新 task.sessionIds
```

它用于从 URL 恢复 TaskDetail，以及点击 Card 打开 TaskDetail 时设置 `activeSessionId`。

这些 fallback 服务于 Task 级 Session 关联和默认选择，不会创建 `TaskLaneSession`，不会进入 Run ledger，也不会创建中栏 Session Tab。它们不是 Kanban Lane 执行历史的数据源。

#### 10.9.3 本轮讨论采用的范围

本轮只讨论手动创建后由 Kanban Lane 自动化执行的 Task，不讨论 CreateTask 传入 Session、历史数据、异常状态或 Session 恢复。因此后续判断只采用：

```text
laneSessions 为空
    -> 没有 Lane Run
    -> 没有中栏 Session Tab

laneSessions 有 N 条
    -> Run ledger 有 N 条
    -> 中栏有 N 个 Session Tab
```

在这个范围内，Run 与 Session Tab 是同一批 `TaskLaneSession` 的两个 UI 视角，而不是两个独立的 Lane 执行实体。

### 10.10 Run 迁移到 Session 的当前方案边界

本轮只处理普通 ACP Kanban Lane Task。A2A Session Pane 不纳入分析、设计或改动范围。

当前左栏外层 `Runs` Tab 渲染 `KanbanCardActivityPanel`，而这个组件内部同时包含三个条件内容：

```text
Runs       始终存在
Handoffs   仅 task.laneHandoffs 非空时存在
GitHub     仅 task.githubNumber 存在时存在
```

Handoffs 和 GitHub 与单次 Run/Session 的归属关系并不相同，但当前代码把它们共同放在 Activity 容器中。为避免扩大范围，本轮不重新定义它们的信息架构，也不迁移或删除它们。

因此本轮采用以下边界：

1. 左栏外层 `Runs` Tab 暂时保留，名称和入口暂不调整。
2. 从其内部移除 `Runs` 子 Tab、Run 数量和 `SessionHistoryPanel` 历史列表。
3. Handoffs 与 GitHub 的现有条件、内容和交互保持不变。
4. 当二者都不存在时，保留的左栏 `Runs` Tab 会出现空内容；是否隐藏或改名留待后续单独讨论。
5. 单条 Run 的现有展示结构迁移到中栏，对应显示在所选 Session Tab 下方、Session 内容上方。
6. Run 卡片不再承担 Session 导航，因此删除整行点击、键盘选择和 `Open/Inspect` 导航语义。
7. Session Tabs 继续作为唯一的 Lane Session 历史导航。

中栏目标结构：

```text
Session Tabs
    -> 当前 Session 对应的 Run metadata
    -> 当前 Session 的 ChatPanel
```

数据对应关系保持不变：

```text
activeSessionId
    -> task.laneSessions 中相同 sessionId 的记录
    -> Run ledger 中相同 sessionId 的条目
    -> Session store 中相同 sessionId 的 Session
```

Run metadata 继续展示现有字段和样式，包括 Run 序号、类型、Lane、Transport、Step、状态、Provider、Role、Specialist、时间、Session ID 和工作目录。除去导航专用行为，不进行视觉重设计。

## 十一、Changes Tab 现状记录

> 记录时间：2026-09-17
>
> 本节只记录 CardDetail 左侧 `Changes` Tab 当前的代码结构和功能。该 Tab 未来计划整体删除，本节不提出重构、迁移或保留方案。

### 11.1 入口和顶层结构

`Changes` Tab 在 `kanban-card-detail.tsx` 中通过 `DetailSection` 包裹一个顶层业务组件：

```text
KanbanTaskChangesTab
```

其实现位于：

```text
src/app/workspace/[workspaceId]/kanban/components/kanban-task-changes-tab.tsx
```

`KanbanTaskChangesTab` 内部实际分为四块：

```text
Changes
  ├─ Repository / Worktree Summary
  ├─ Committed Changes
  ├─ Local Changes
  └─ Pull Request Specialist
```

### 11.2 Repository / Worktree Summary

该区域是 `KanbanTaskChangesTab` 内的内联 JSX，用于展示当前 Task 所对应的 Git 上下文：

- Repository 标签。
- 数据来源是 Repository 还是 Worktree。
- 实际工作路径。
- 当前分支。
- Ahead / Behind 数量。
- Modified / Untracked 文件汇总。
- GitHub / GitLab remote 识别结果。

主要数据由以下接口提供：

```text
GET /api/tasks/:taskId/changes
```

Rust 实现会优先解析 Task Worktree；没有 Worktree 时，使用第一个关联 Codebase，然后获取路径、分支、remote、工作区改动以及相对基准分支的 commits。

### 11.3 Committed Changes

当 `taskChanges.commits` 非空时渲染，主要包含：

- `CommitRow`：展示相对基准分支新增的 commit。
- `TaskCommitDiffPreview`：展示当前选中 commit 的完整 diff。

点击 `CommitRow` 会选中或取消选中 commit。选中后按需请求：

```text
GET /api/tasks/:taskId/changes/commit?sha=...&context=full
```

组件按 commit SHA 缓存已加载的 diff 和错误，避免重复请求。`CommitRow` 和 `TaskCommitDiffPreview` 定义在 `kanban-diff-preview.tsx` 中。

### 11.4 Local Changes

该区域使用：

```tsx
<KanbanEnhancedFileChangesPanel embedded />
```

CardDetail 中走的是 `embedded` 分支，实际包含：

- `KanbanUnstagedSection`
- `KanbanInlineDiffViewer`
- `KanbanStagedSection`
- `KanbanCommitModal`

它提供以下操作：

- 列出本地改动文件。
- 选择文件并查看单文件内联 diff。
- Stage 或 Unstage 选中文件。
- 确认后丢弃选中改动。
- 打开提交弹窗并创建 commit。
- 展示 Auto-commit 开关/状态，以及 loading、error 和 empty 状态。

当前 `embedded` 模式存在一个重要的数据边界：

```ts
unstagedFiles = changes.files || []
stagedFiles = []
```

因此 CardDetail 虽然挂载了 `KanbanStagedSection`，但当前接口结果在这条渲染路径中没有真实区分 staged 和 unstaged；`changes.files` 全部被当作 unstaged 处理。

`KanbanEnhancedFileChangesPanel` 在非 embedded 场景还拥有 `KanbanCommitsSection`、`KanbanGitOperationButtons`、`KanbanWorkflowActions` 以及 export、pull、rebase、reset 等能力。这些属于另一个返回分支，不是 CardDetail `Changes` Tab 的实际内容。

### 11.5 Pull Request Specialist

该区域也是 `KanbanTaskChangesTab` 内的内联 JSX。它只在以下条件同时满足时显示：

```text
识别到 GitHub 或 GitLab remote
AND 存在 onRunPullRequest 回调
AND 存在 committed changes 或 local changes
```

点击后会调用 `onRunPullRequest(taskId)` 启动一个 PR Specialist Session，然后通过 `onSelectSession` 选中返回的 Session。该组件本身不直接创建 Pull Request，而是启动用于处理 PR 流程的 Agent Session，并显示启动中与错误状态。

### 11.6 当前边界结论

CardDetail `Changes` Tab 不是单纯的 diff 查看器，它当前同时承担：

```text
Git 上下文摘要
+ Commit 历史与 diff
+ 工作区文件操作
+ Commit 创建
+ PR Agent Session 启动入口
```

已知的产品方向是未来删除整个 `Changes` Tab。本记录仅作为删除前的实现快照，不表示上述任一子功能必须迁移或保留。

---

## 十二、JIT Context / History Memory 调查记录

> 本节记录 CardDetail `JIT Context` / `History Memory` 的完整调查结果，为未来可能删除该 Tab 提供实施依据。

### Executive Conclusion

CardDetail 中用户看到的 `History Memory`，内部名称是 `jitContext`，实际组件是 `JitContextPanel`：

```text
Tab id:        jitContext
Component:     JitContextPanel
UI label:      History Memory / 历史记忆
Task field:    Task.jitContextSnapshot
DB column:     tasks.jit_context_snapshot
```

当前产品把两种不同能力放进了同一个 Tab：

```text
JIT / Task-Adaptive Harness
  = 不调用 LLM 的规则检索、信号提取、评分和缓存

History Analysis / history-summary-analyst
  = 独立 LLM Agent 对预加载材料做语义归纳并保存分析结论
```

因此，不能把整个 `jitContextSnapshot` 都称为“LLM 总结的经验”。基础 JIT 快照只是结构化检索结果；只有 `jitContextSnapshot.analysis` 是 `history-summary-analyst` 生成的语义分析结果。

`History Memory` 也不是 Commit History：基础生成链没有通过 Git commit SHA 建模，不以 `git log` 或历史 commit 为主要输入，快照中也没有 commit id 字段。

### Terminology And Correct Semantics

#### JIT

`JIT` 是 `Just-In-Time`，表示在用户展开面板、启动任务或需要上下文时按需生成，而不是 JavaScript JIT 编译。

#### History

这里的 `History` 主要指同一仓库内过去的 Agent/ACP/Codex/Claude 执行痕迹，包括 prompt、工具调用、读取/修改文件、失败信息和重复读取。它不是 Git commit history，也不等于完整的 Task 状态变更历史。

#### Memory

基础 JIT 没有认知意义上的“记忆”或“经验学习”。它执行的是确定性程序逻辑：

```text
读取本地记录
  -> 提取结构化信号
  -> 根据 Task hints 匹配和打分
  -> 用固定模板组装报告
  -> 保存快照供后续复用
```

所以基础功能更准确的名称是 `Historical Context`、`Execution Signals` 或 `JIT Context Cache`。

只有可选的 `history-summary-analyst` 会调用 LLM；其保存的 `jitContextSnapshot.analysis` 才可以理解为经过语义归纳、可供下次工作复用的 Memory。

### Data Model And Persistence

JIT 不是独立数据库实体或独立表，而是挂在 Task 上的可选字段：

```text
Task
  |- contextSearchSpec
  |    检索 query、feature、file、route、API、module、symptom hints
  |
  `- jitContextSnapshot
       JIT 检索快照及可选的 LLM analysis
```

主要定义：

```text
src/core/models/task.ts
  TaskContextSearchSpec
  TaskJitContextSnapshot
  TaskJitContextAnalysis
```

数据库映射：

```text
PostgreSQL: tasks.jit_context_snapshot JSONB
SQLite:     tasks.jit_context_snapshot TEXT(JSON)
```

对应文件：

```text
src/core/db/schema.ts
src/core/db/sqlite-schema.ts
src/core/db/sqlite.ts
src/core/db/pg-task-store.ts
src/core/db/sqlite-task-store.ts
```

基础快照主要包含：

```text
generatedAt
repoPath
featureId / featureName
summary                    固定模板生成，不是 LLM 摘要
matchConfidence            规则判断
matchReasons               固定规则说明
warnings
matchedFileDetails
matchedSessionIds
failures
repeatedReadFiles
sessions
historySummary             程序压缩结果，不是 LLM 摘要
recommendedContextSearchSpec
analysis                   可选，由 LLM analyst 保存
perLaneAnalysis            规则化泳道经验数据，不是 LLM 结果
```

### Deterministic JIT Generation

#### Trigger And UI Entry

CardDetail 入口：

```text
src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx
  activeTab === "jitContext"
    -> JitContextPanel

src/app/workspace/[workspaceId]/kanban/kanban-detail-panels.tsx
  JitContextPanel
```

用户首次展开未加载的面板或点击刷新时，前端调用：

```text
POST /api/harness/task-adaptive
```

#### Search Inputs

`buildKanbanTaskAdaptiveHarnessOptions()` 从 Task 收集并标准化：

```text
taskId
taskLabel / title
query
featureIds
filePaths
routeCandidates
apiCandidates
moduleHints
symptomHints
historySessionIds
taskType
role
locale
```

主要来源是 `Task.contextSearchSpec`、Task 标题和旧快照推荐的 `recommendedContextSearchSpec`。如果没有显式 query，则回退到 Task 标题。

Task 处于 Backlog 且没有经过 refinement 确认任何检索 hints 时，JIT 不应生成或保存推测性快照；旧的推测快照会被清理。

#### Retrieval Sources

后端 Task-Adaptive Harness 读取：

```text
docs/product-specs/feature-tree.index.json
Feature Surface Index
同一 repo 范围内最近 30 天的本地 transcript
.routa/feature-explorer/friction-profiles.json（若存在）
```

Transcript provider 可以是 Codex、Claude、Qoder、Augment 或 unknown。候选 transcript 必须与 repo root / git identity 匹配；默认最多扫描 200 个 transcript 文件。

#### Feature And File Inference

英文 hints 按单词拆分，中文 hints 生成 2-4 字片段，并过滤 `task`、`file`、`context`、`jit` 等通用词。

主要规则分值包括：

```text
显式 feature candidate                  +20
Route 精确命中页面入口                  +12
API 命中实现入口                        +12
Feature 包含命中 Route                  +10
Feature 包含命中 API                    +10
关键词出现在 Feature/页面/API/文件信息   按命中数量加分
```

默认最多保留 3 个推断 Feature、8 个候选文件。

#### Execution Signal Extraction

系统从 transcript 事件中提取：

- 命令和工具名称。
- read/open/view 之类调用涉及的文件。
- patch、`git status --short`、`git diff --name-only`、`git diff`、`git show` 暴露的修改文件。
- 非零退出码或 `failed/error` 状态。
- `permission denied`、`no such file`、`not found`、`ENOENT` 等高信号读取失败。
- 同一文件的重复读取和同一命令的重复执行。

实现集中在：

```text
src/core/harness/task-adaptive.ts
src/core/harness/task-adaptive-path-signals.ts
src/core/harness/transcript-sessions.ts
```

#### Ranking

基础 JIT 对候选执行记录使用固定摩擦分数排序：

```text
frictionScore =
    failedReadSignals * 10
  + repeatedReadFiles * 4
  + matchedReadFiles * 2
  + matchedChangedFiles * 1
```

默认最多保留 6 个结果。`matchConfidence` 也由显式 hints、结构化 hints、选中文件和命中数量按规则决定，并非 LLM 判断。

#### Snapshot Write

后端先返回 `TaskAdaptiveHarnessPack`。前端的 `buildTaskJitContextSnapshot()` 将其转换为 `TaskJitContextSnapshot`，然后执行：

```text
PATCH Task
  { jitContextSnapshot: nextSnapshot }
```

最后由 Task Store 写入 `tasks.jit_context_snapshot`。

`summary` 和 `historySummary.overview` 都是固定模板拼接，基础流程没有调用 LLM、Embedding、向量数据库、LangChain 或 LlamaIndex。

### History Summary Analyst

#### Boundary

`history-summary-analyst` 是 JIT Tab 中 `Open History Analysis` 动作启动的独立 LLM Agent。它不是基础 JIT 请求的一部分，也不会在用户仅展开或刷新面板时自动运行。

Specialist 定义：

```text
resources/specialists/tools/history-summary-analyst.yaml
resources/specialists/locales/en/tools/history-summary-analyst.yaml
resources/specialists/locales/zh-CN/tools/history-summary-analyst.yaml
```

配置重点：

```text
id: history-summary-analyst
role: ROUTA
model_tier: smart
repo code: read-only
```

#### What The Analyst Reads

Agent 默认不读取所有原始 transcript。创建 Agent 之前，UI 先调用：

```text
POST /api/harness/task-adaptive/history-summary
```

该接口的入参来自刷新后的 Task-Adaptive Harness options：

```text
workspaceId
repoPath
taskLabel
locale
query
featureId / featureIds
filePaths
routeCandidates
apiCandidates
historySessionIds
moduleHints
symptomHints
taskType
maxFiles / maxSessions
role
```

接口返回：

```text
historySummary
featureId / featureName
selectedFiles
matchedFileDetails
matchedSessionIds
warnings
```

这次预加载仍然是确定性代码，不调用 LLM。实现位置：

```text
src/app/api/harness/task-adaptive/history-summary/route.ts
src/core/harness/task-adaptive-tool.ts
  summarizeTaskHistoryContextFromToolArgs()
```

前端随后通过 `buildJitHistoryAnalysisPrompt()` 将以下材料放入 User Prompt：

```text
Task ID、标题、目标
Workspace、Repo Path、Task Type
匹配 Feature 和置信度
预加载 History Summary
候选文件及统计
最终命中的 Codex/Claude sessions：id、provider、prompt snippet、相关文件
较弱的 seed sessions：id、provider、prompt snippet、touched files
可选 transcript JSONL 路径提示
命中原因、警告、失败信息、重复读取热点
保存结果的强制格式和 tool 调用要求
```

System Prompt 要求：

1. 优先使用预加载的 `summarize_task_history_context` 结果。
2. 默认不重复调用该工具。
3. 默认不逐个回读所有 transcript。
4. 只有摘要不足时，才读取极少量高相关 JSONL 或要求补充 hints。
5. 重要结论必须引用摘要或匹配文件证据，并明确区分证据与推断。
6. 最终必须调用 `save_history_memory_context`。

所以 Analyst 真正的默认 LLM 输入不是“全部历史”，而是：

```text
Specialist System Prompt
  + 少量 Task 基本信息
  + 确定性程序生成的压缩证据
  + 候选文件和 session snippets
  + 可选的少量 transcript 读取能力
```

#### How The Agent Is Started

`Open History Analysis` 创建的是独立 ACP Session，不是当前会话内的子 Agent：

```text
用户点击 Open History Analysis
  -> UI 刷新 harness options
  -> POST /api/harness/task-adaptive/history-summary
  -> buildJitHistoryAnalysisPrompt()
  -> window.open("about:blank")
  -> POST /api/acp, method=session/new
  -> 后端创建独立 ACP Session
  -> 新窗口跳转 /workspace/:workspaceId/sessions/:sessionId
  -> POST /api/acp, method=session/prompt
  -> Provider Agent 开始执行 LLM 分析
```

`session/new` 的核心参数：

```text
workspaceId
cwd / branch
role: ROUTA
name: History Analysis / 历史分析 + Task title
provider
specialistId: history-summary-analyst
specialistLocale
toolMode: full
mcpProfile: kanban-planning
allowedNativeTools: Skill, Read, Glob, Grep
taskAdaptiveHarness
```

实现入口：

```text
src/app/workspace/[workspaceId]/kanban/kanban-tab-panels.tsx
  startKanbanHistoryAnalysisSession()

src/app/api/acp/acp-session-create.ts
  handleSessionNew()
  loadSpecialistConfig()
  buildSpecialistSystemPrompt()
```

ACP 创建过程会：

1. 按 `specialistId` 和 locale 从数据库或 YAML cache 加载 Specialist。
2. 将 `system_prompt` 和 `role_reminder` 组装为 Specialist System Prompt。
3. 从当前 session、Board auto provider 或 ACP selected provider 选择 Provider。
4. 按 `model_tier: smart` 映射 Provider 对应模型；若 Specialist/请求显式配置 model，则按优先级覆盖。
5. 创建对应 Provider 的 ACP/SDK 运行实例。
6. 配置 `kanban-planning` MCP profile 和只读原生工具。
7. 保存 Session 元数据并返回 `sessionId`。
8. `session/prompt` 收到构造好的 User Prompt 后才真正开始 LLM 推理。

#### Analyst Output And Persistence

Agent 被要求调用：

```text
save_history_memory_context
```

只保存：

```text
summary
topFiles
topSessions[] {
  sessionId
  provider?
  reason
}
reusablePrompts
recommendedContextSearchSpec
updatedAt?
```

保存目标是：

```text
Task.jitContextSnapshot.analysis
```

约束包括：

- `summary` 最多两句，表达下次先看什么以及主要风险/判断点。
- `topSessions.reason` 每项一句。
- `reusablePrompts` 必须是可直接交给下一个 Agent 的祈使句。
- 不保存完整推理链、过程分类或 UI 已展示的证据列表。

`save_history_memory_context` 在 MCP 层调用 Task tool，合并并持久化 `jitContextSnapshot.analysis`，不会创建独立 History Memory 数据表。

### Other Consumers Outside The JIT Tab

未来删除 JIT Tab 时，不能仅按 UI 名称全仓删除 `jitContextSnapshot`。以下能力不依赖该 Tab 的可见性：

1. **Task prompt preload**
   - 当前 Task 已保存的 `jitContextSnapshot.analysis` 可以作为 `Saved History Memory` 注入后续 Todo/Dev/Review Session。

2. **Cross-task relevant memory**
   - `src/core/kanban/context-preload.ts` 会读取同一 Workspace 中其他 Task 的 `jitContextSnapshot.analysis`。
   - 当前 Task 自身被排除。
   - 按 repo、Feature、文件、Route、API、module、symptom 和 query overlap 打分，最多选择少量 `Relevant History Memory`。

3. **Automatic session-start hydration**
   - `src/app/api/acp/acp-session-create.ts` 根据 Board `historyMemoryPolicy` 决定新 Session 是否自动注入 Relevant History Memory 和 Feature Tree context。
   - `historyMemoryPolicy` 控制自动 preload，不控制用户手动打开 JIT Tab。

4. **Agent trigger and task prompt construction**
   - `src/core/kanban/agent-trigger.ts` 使用 snapshot、analysis 和相关文件构造执行提示及 reasoning-memory hints。

5. **Lane experience**
   - `src/core/kanban/task-lane-experience.ts` 将 Task 的 lane sessions/handoffs 规则化写入 `jitContextSnapshot.perLaneAnalysis`。
   - 这部分不调用 LLM，但与同一字段共存。

6. **MCP tools**
   - `assemble_task_adaptive_harness`
   - `summarize_task_history_context`
   - `inspect_transcript_turns`
   - `save_history_memory_context`
   - 这些工具可能有 CardDetail 之外的调用者。

### Future JIT Tab Removal Boundary

未来若决定只删除 CardDetail 的 JIT Tab，建议采用与 Changes Tab 相同的“UI 删除、后端能力暂留”边界。

#### Safe First Phase: Remove Only The Tab Surface

删除候选：

```text
kanban-card-detail.tsx
  - KanbanDetailTabId 中的 jitContext
  - detailTabs 中的 History Memory 导航项
  - activeTab === "jitContext" 分支
  - 只服务该分支的 props

kanban-detail-panels.tsx
  - JitContextPanel（确认无其他生产调用者后）
  - 只服务该面板的展示、刷新、注入和 Open History Analysis helpers

kanban-tab-panels.tsx
  - onOpenJitContextHistoryAnalysis prop 链
  - startKanbanHistoryAnalysisSession()
  - buildKanbanHistoryAnalysisSessionName()
  - 只服务该入口的新窗口/session 创建逻辑

i18n/tests
  - 只服务 JIT Tab 和面板的 locale keys、DOM tests、prompt tests
```

第一阶段建议保留：

```text
Task.contextSearchSpec
Task.jitContextSnapshot
TaskJitContextSnapshot / TaskJitContextAnalysis 类型
tasks.jit_context_snapshot 数据库列
Task Store 读写和 normalize/merge 逻辑
Task-Adaptive Harness API 和 core retrieval
history-summary-analyst Specialist 定义
save_history_memory_context 和其他 MCP tools
Saved/Relevant History Memory 自动 preload
historyMemoryPolicy
Agent trigger、context preload、lane experience consumers
```

保留 `history-summary-analyst` 的理由：删除 JIT Tab 只会移除目前的手动启动入口；不能据此证明 Specialist 没有 MCP、API、自动化或未来其他 UI 调用者。是否连同分析能力删除，应作为第二阶段独立产品决策。

#### Second-phase Decisions Required

若目标不是“删除 Tab”，而是彻底移除 JIT/History Memory 能力，必须逐项明确：

1. 是否停止新 Task 写入 `jitContextSnapshot`。
2. 是否删除已保存 `analysis` 的后续 Task prompt 注入。
3. 是否删除跨 Task `Relevant History Memory` 检索。
4. 是否删除 Board `historyMemoryPolicy` 和设置 UI。
5. 是否删除 `history-summary-analyst` Specialist。
6. 是否删除四个相关 MCP tools 或只缩减 allowlist。
7. 是否删除 Task-Adaptive Harness session-start hydration。
8. 是否迁移或直接丢弃现有 `tasks.jit_context_snapshot` 数据。
9. 是否拆出仍有价值的 `contextSearchSpec`、Feature Tree preload 和 lane experience。
10. Web/Postgres、Desktop/SQLite 是否同步迁移并保持 API/domain parity。

这些问题没有明确答案前，不应删除数据字段、数据库列、Task Store 映射或自动 preload 代码。

### Risks And Naming Problems

1. `History Memory` 把确定性检索结果和 LLM 结论混为一个产品概念，容易让用户误以为基础 JIT 会学习或总结经验。
2. `summary` 与 `historySummary` 虽然名称像 AI 摘要，实际由模板生成；只有 `analysis` 是 LLM 输出。
3. Tab 删除后如果保留自动 preload，用户仍可能在 Session Prompt 中看到 `Saved History Memory` 或 `Relevant History Memory`，产品命名需要单独处理。
4. 直接删除 `jitContextSnapshot` 会同时影响 UI、ACP session startup、Task prompt、跨 Task memory、lane experience、MCP 和双后端持久化，属于跨核心变更。
5. `history-summary-analyst` 默认分析压缩材料，不默认阅读完整 transcript；如果未来保留该 Specialist 但移除 JIT 检索，必须为其提供新的证据入口。

### Recommended Product Vocabulary

在没有进一步产品决策前，文档和架构讨论应使用以下明确名称：

```text
Task-Adaptive Harness / JIT retrieval
  确定性检索、匹配、评分和快照生成

History Analysis
  history-summary-analyst 执行的 LLM 分析流程

Saved History Analysis
  Task.jitContextSnapshot.analysis 中的持久化 LLM 结果

Relevant History Memory
  从其他 Task 已保存 analysis 中检索出的跨 Task preload
```

避免把基础 `jitContextSnapshot` 笼统称为“经验”或“LLM Memory”。

## 10.11 Historical Lane Session Agent Metadata Bug

### Symptom

在 Kanban Detail 中切换不同的 Lane Session Tab 后，下面的 Agent 信息仍然保持不变，例如：

```text
claude · CRAFTER · Backlog Refiner
```

当前 Tab 本身会正确切换为不同的 `laneSession`，因此这不是 Tab 选择或 `selectedLaneSession` 绑定错误。

### Expected Semantics

中栏展示的是 `task.laneSessions` 历史。选中某个 Tab 后，下方内容应描述该 Tab 对应的历史 Session。

如果要显示“该历史 Session 实际使用的 Agent”，权威来源应是：

```text
selected ACP Session.provider
```

字段语义应明确区分：

```text
session.provider
  实际 ACP Agent / Provider，例如 claude、codex、opencode

session.role
  执行角色，例如 CRAFTER、DEVELOPER、REVIEWER

laneSession.stepName
  Lane Step / Specialist 的配置名称

laneSession.specialistId / specialistName
  Kanban 编排元数据，不等同于 ACP Agent Provider
```

因此 Provider、Role、Specialist 不应被拼成一个未经区分的“Agent 身份”。当前产品若只需要显示实际 Agent，应使用 `session.provider`，与 `role` 和 Specialist 解耦。

### Root Cause

本地 Rust Kanban ACP 路径在创建 ACP Session 时使用 Task 级 assignment：

```text
ACP Session.provider <- task.assigned_provider
ACP Session.role     <- task.assigned_role
```

相关代码：

```text
crates/routa-server/src/api/tasks_automation.rs:249-299
```

随后写入 `TaskLaneSession` 时仍使用 Task 级字段，而不是当前 Lane Step 解析出的执行目标：

```text
laneSession.stepName       <- current Lane Step specialist_name
laneSession.provider       <- task.assigned_provider
laneSession.role           <- task.assigned_role
laneSession.specialistId   <- task.assigned_specialist_id
laneSession.specialistName <- task.assigned_specialist_name
```

相关代码：

```text
crates/routa-server/src/api/tasks_automation.rs:635-662
```

结果是多个历史 `laneSession` 可能拥有相同的 `provider/role/specialist`，即使它们的 Lane 或 Step 不同。`stepName` 记录的是 Lane Step，而副标题读取的是另一组 Task assignment 字段，造成视觉上“切换 Tab 但 Agent 信息不变”。

当前中栏副标题的读取逻辑位于：

```text
src/app/workspace/[workspaceId]/kanban/kanban-card-activity.tsx:202-246
```

它优先读取：

```text
laneSession.provider ?? session.provider
laneSession.role ?? session.role
laneSession.specialistId / specialistName
```

因此错误写入的 `laneSession.provider` 会覆盖更可靠的 ACP `session.provider`。

### Recoverability Of Existing Data

对于已有历史记录：

```text
session.provider / session.role
  通常仍可从 ACP Session SQLite 记录读取

laneSession.columnName / laneSession.stepName
  可用于确认 Lane 和当时的 Step 配置名称

laneSession.specialistId / specialistName
  当前写入口径不可靠，不能作为实际 Agent 身份的权威来源
```

因此已有数据通常可以恢复“实际 ACP Provider”，但不能保证恢复当时实际使用的 Specialist 实例。

### Fix Boundary For Follow-up Agent

后续修复 Agent 应分别处理两个问题：

1. **展示口径**：中栏若显示实际 Agent，应以选中 Tab 对应 ACP Session 的 `session.provider` 为主，不让错误的 `laneSession.provider` 覆盖它；`role` 和 Specialist 不应冒充 Agent 身份。
2. **写入口径**：如果 `laneSession` 需要保存每次 Lane Step 的执行目标快照，应在创建时写入 resolved Lane Step 的 Provider、Role、Specialist，而不是无条件使用 Task assignment。

本 Bug 不属于：

```text
Tab 选择错误
当前 Session 绑定错误
laneSession.status 状态同步问题
ACP 子进程存活检测问题
```

它是“历史 Lane Session 执行目标快照写入与展示字段选择不一致”的问题。

## 十三、Session Run Metadata 卡片字段口径调查

> 记录时间：2026-09-22
>
> 本节记录中栏 Session Tab 下方 `KanbanSessionRunMetadata` 卡片每个字段的真实数据来源与写入方，作为后续简化/删除该卡片的依据。本轮只调查记录，未修改业务代码。

### 13.1 组件位置与整体结构

组件定义与渲染点：

```text
src/app/workspace/[workspaceId]/kanban/kanban-card-activity.tsx:187
  export function KanbanSessionRunMetadata(...)

同文件 :437
  KanbanCardActivityBar 在选中 Tab 下方以 compact 渲染
  仅在 selectedLaneSession 存在时渲染（:435）
```

卡片是三段结构：

```text
徽章行      run.kind / laneSession.transport / run.status ?? laneSession.status
中间行      标题 + 副标题(provider · role · specialist) + 时间戳 | SessionIdChip
cwd 行      session.cwd（a2a 时改为 Context <contextId>）
```

### 13.2 标题：session.name 的写入方

非 a2a 路径标题为 `session.name ?? session.provider ?? "Automation Run"`（`formatLaneSessionHeading`，kanban-card-activity.tsx:106-119）。实际观察到的 `kimi` 这类花名来自 **agent 自命名**，写入链路有两条：

```text
1. Agent 调用 set_agent_name MCP 工具
   src/core/acp/opencode-sdk-adapter.ts:1137-1146
     -> store.renameSession(sessionId, args.name)
     -> renameSessionInDb(...)
   src/core/acp/claude-code-sdk-adapter.ts:951-994
     额外识别 Bash: echo "Agent name: ..." 的 fallback 模式

2. 用户手动 rename
   PATCH /api/sessions/{id}
   crates/routa-server/src/api/sessions.rs:391
     -> acp_session_store.rename -> UPDATE acp_sessions SET name = ...
```

关键事实：DB 创建 session 时 `name` 为 NULL（crates/routa-core/src/store/acp_session_store.rs:274 的 INSERT 不含 name 列）。因此**没有调用过 set_agent_name 的 agent 标题会退到 `session.provider`**——标题有时显示花名、有时显示 provider id，取决于 agent 运行行为，不是可靠字段。

### 13.3 副标题：provider / role / specialist

三段由不同语义拼成，用 `·` 连接（kanban-card-activity.tsx:235-247）：

```text
provider    laneSession.provider ?? session.provider ?? i18n unknownProvider
role        laneSession.role ?? session.role ?? i18n unknownRole
specialist  getSpecialistName(laneSession.specialistId,
                              run.specialistName ?? laneSession.specialistName,
                              specialists)
            优先按 specialistId 在 specialists 列表解析 displayName
```

数据语义：

- `laneSession` 是 run 触发时刻的历史快照（`upsertTaskLaneSession`，src/core/kanban/task-lane-history.ts:24），其 provider 写入口径存在 10.11 记录的 bug。
- `session` 是 live ACP 记录，来自 `/api/sessions?limit=100`（kanban-page-client.tsx:179）。老卡片的 session 可能不在返回窗口内，此时静默退到 i18n 兜底文案，UI 无法区分“数据缺失”与“未知”。
- fallback 方向不一致：标题以 `session` 优先，副标题以 `laneSession` 优先。

role 与 specialist 的语义区分：

```text
role        ACP 行为模式：CRAFTER / DEVELOPER / ROUTA 等
specialist  工作流步骤人格：Backlog Refiner 等 YAML 定义
```

### 13.4 Specialist 的实际注入口径

Specialist 定义是 YAML 文件（resources/specialists/workflows/kanban/backlog-refiner.yaml），核心载荷是 `system_prompt`，附 `role_reminder`、`model_tier` 等元数据。它不是独立参数，而是被物化为文本注入。两条路径的行为不同：

**Next.js ACP session 创建路径（会注入）：**

```text
src/app/api/acp/acp-session-create.ts:103-146
  loadSpecialistConfig(specialistId, locale)   文件缓存 / Postgres specialist store
  buildSpecialistSystemPrompt(specialist)      systemPrompt + roleReminder
:528-557
  拼入 customSystemPrompt / history memory 等，存为 session 记录的
  specialistSystemPrompt

送达方式按 provider 分流：
  Claude        -> append_system_prompt
                   crates/routa-core/src/acp/mod.rs:850
  其他 ACP      -> 拼进第一条 user prompt 头部
                   src/core/acp/session-prompt.ts:710-713
```

**Rust kanban automation 路径（不注入）：**

```text
crates/routa-core/src/rpc/methods/kanban/automation.rs:700-735
  trigger_assigned_task_acp_agent 创建 session 只传 provider + role
:1008-1009
  specialist 仅以 assigned_specialist_id/name 元数据记录在 task/laneSession
```

agent 实际收到的行为规范来自 `build_task_prompt` 中按 lane_id 硬编码的 lane_guidance（automation.rs:451-465），不是 specialist YAML。因此 **Rust 路径下副标题里的 "Backlog Refiner" 只是标签，agent 并不知道自己是该 specialist**。这是双后端语义分叉，与 AGENTS.md 的 cross-backend invariants 要求冲突，后续需单独处理。

### 13.5 时间戳：就是 laneSession.started_at

展示值的三级回退 `run.startedAt ?? session.createdAt ?? laneSession.startedAt` 实际收拢为一项：

```text
laneSession.startedAt
  <- crates/routa-core/src/rpc/methods/kanban/automation.rs:1021
     创建 lane session 时写入 Utc::now()

run.startedAt
  <- crates/routa-server/src/api/tasks/evidence.rs:130
     started_at: Some(lane_session.started_at.clone())
     即 run.startedAt 与 laneSession.startedAt 是同一个值
```

这与 10.8.4 的结论一致：Run ledger 是从 `task.lane_sessions` 动态派生的读模型，不是独立数据源。中间那项 `session.createdAt` 只在 runs 接口失败、`run` 为 undefined 时才会命中。格式由 `formatSessionTimestamp` 的 `toLocaleString()` 决定，跟随浏览器 locale。

### 13.6 SessionIdChip：五个回退槽位收拢为一个 if/else

chip 显示值的回退链（kanban-card-activity.tsx:252-255）：

```text
run.externalTaskId ?? laneSession.externalTaskId ?? sessionId
sessionId = laneSession?.sessionId ?? run?.sessionId ?? session?.sessionId ?? ""
```

实际收拢结果：

- `run.externalTaskId` 与 `laneSession.externalTaskId` 是同一个值（evidence.rs:120 直接 clone）。
- `external_task_id` 只在 a2a run 赋值（automation.rs:1011）；embedded_acp 路径全部为 None（automation.rs:899 / 1164 / 1210）。
- 组件只在 `selectedLaneSession` 存在时渲染（kanban-card-activity.tsx:435），sessionId 链的后三项在实际使用路径下是死代码。

因此等价于：

```text
a2a          -> laneSession.externalTaskId（远端 A2A task id）
embedded_acp -> laneSession.sessionId
                = 触发时 uuid::Uuid::new_v4() 生成的 ACP 会话 UUID
                （automation.rs:718）
```

注意 a2a 的远端 task id 与内部 session id 语义不同，却共用了同一个渲染位。复制按钮（SessionIdChip，:145-185）把显示值写入剪贴板，1.5 秒 Check 反馈，`stopPropagation` 防止误触 Tab 切换。

产品决策备注：sessionId 展示部分后续有详细设计，当前实现考虑整体删除。本节仅作现状快照，未改动。

### 13.7 cwd 行

单字段三分支（kanban-card-activity.tsx:257-263）：

```text
a2a 且有 contextId -> "Context <contextId>"
a2a 且无 contextId -> "Remote task metadata available"
非 a2a             -> session.cwd ?? i18n "Working directory unavailable"
```

只读 `session.cwd`，没有 laneSession/run 兜底；当 session 不在 `/api/sessions?limit=100` 返回窗口内时，即使 run 数据完整也显示“不可用”文案。

### 13.8 字段口径速查

| 字段 | 实际口径 | 写入方 |
| --- | --- | --- |
| 徽章 kind | run.kind（由 transport 推导：a2a -> a2a_task，否则 embedded_acp） | evidence.rs:110-114 |
| 徽章 transport | laneSession.transport | automation.rs:1010 |
| 徽章 status | run.status ?? laneSession.status（同源） | laneSession.status |
| 标题 | session.name（agent 自命名 / 用户 rename），否则 provider | set_agent_name 工具 / PATCH rename |
| 副标题 provider | laneSession.provider 快照（写入有 10.11 bug） | upsertTaskLaneSession |
| 副标题 role | laneSession.role 快照 | upsertTaskLaneSession |
| 副标题 specialist | specialistId 解析 displayName；Rust 路径不注入其 system_prompt | task/laneSession 元数据 |
| 时间戳 | laneSession.started_at（run 启动时刻） | automation.rs:1021 |
| SessionIdChip | embedded: laneSession.sessionId；a2a: externalTaskId | automation.rs:718 / 1011 |
| cwd 行 | session.cwd | ACP session 记录 |

### 13.9 与 10.11 的关系

本节确认了 10.11 的展示口径问题（副标题让错误的 `laneSession.provider` 覆盖 `session.provider`），并新增两个此前未记录的口径问题：

1. 标题依赖 agent 运行时自命名行为，`session.name` 不是必填字段，展示不稳定。
2. Rust kanban automation 路径完全不注入 specialist system_prompt，specialist 在该路径下退化为纯展示标签。

## 十四、Execution Tab 的功能边界（补充）

### 14.1 它描述的是 Task + 当前 Lane 的有效执行目标

`Execution` 不是单独回答“这个 Task 属于哪个 Agent”，而是展示：

```text
Task 在当前 Lane 中
按照 Lane 默认自动化规则
加上 Task 自身覆盖配置后
最终会由谁、通过什么流程执行
```

配置优先级为：

1. Task/Card 上显式配置的 Provider、Role、Specialist。
2. 当前 Lane 的默认 automation pipeline。
3. 当前选择的 Provider 仅在允许自动替换 Provider 的路径中覆盖 Provider，Lane 的 Role 和 Specialist 仍然保留。

因此 `Execution` 展示的是有效配置（effective execution），而不是 Task 的静态属性。

### 14.2 当前不是只读 Tab

当前 `Execution` 同时包含只读信息和操作入口。

只读信息包括：

- Lane 是否启用 automation。
- Lane pipeline。
- Current run 的 Provider、Role、Specialist 和 Transport。
- 当前列及下一列所需的 artifact/evidence。
- 当前运行失败信息。

操作入口包括：

- 编辑或重置 Card session override。
- 选择 Provider、Role、Specialist 和 fallback agent chain。
- 绑定 Repository/Worktree。
- 点击 `Run`、`Rerun` 或 `Recover Live Run` 启动新的 Agent Session。

因此当前 `Execution` 更准确的职责描述是“执行配置、有效目标预览和手动启动入口”的组合面板。`Run` 按钮并不是独立的 Run Tab 或 Run 区块，而是嵌在 `Execution` 区块底部的操作。

### 14.3 Run 按钮的显示前置条件

TaskDetail 中的按钮使用以下条件：

```ts
canRunTask = effectiveAutomation.canRun && task.columnId !== "done";
```

`effectiveAutomation.canRun` 在以下任一情况成立时为真：

- 当前 Lane 的 automation 已启用；
- Task/Card 有 Provider、Role、Specialist 等显式覆盖，足以形成 Card-level automation。

因此以下情况通常不会显示按钮：

- Task 位于 `done` 列；
- 当前 Lane 没有启用 automation；
- Task 也没有有效的 Card-level automation 覆盖。

当前显示逻辑不检查 `triggerSessionId`、Session 是否仍在运行、Session 是否失败或 Task 是否排队。只要上述 `canRunTask` 为真，按钮就可能出现。

按钮文案的含义也不是严格的运行状态：

- 从未有历史 Session 时显示 `Run`；
- 只要存在历史 Session 就可能显示 `Rerun`；
- 特定的过期 embedded Session 错误显示 `Recover Live Run`。

### 14.4 Run 的实际动作

点击这些按钮最终都调用 `onRetryTrigger(task.id)`。后端会清理旧的 `triggerSessionId`、创建新的 Agent Session、使用当前 Lane/Card 有效配置启动 Agent，并更新 `sessionIds`、`laneSessions` 和当前 `triggerSessionId`。

它不是：

- 恢复旧 Session；
- 直接执行测试命令；
- 自动完成 Task；
- 自动移动 Card。

因此 `Run` / `Rerun` 的实际语义更接近“为当前 Task + Lane 配置启动一个新的 Agent Session”。
