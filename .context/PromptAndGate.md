# Routa Prompt 与 Kanban Gate 调查

本文记录 Kanban Dev/Review automation、Routa `role`/`specialist`、ACP prompt，以及 screenshot artifact gate 的调查结论。

## 1. 核心结论

Routa 的 `role` 和 `specialist` 不是 ACP 标准里的 prompt 类型。

```text
ACP                         负责 session、prompt 传输、通知和结果
Routa role                  Agent 分类和编排 metadata
Routa specialist            职责配置、system prompt、提醒和执行默认值
Kanban automation step      某个 lane 中的 automation 配置项；当前 dispatch 实际只使用 primary step
Kanban gate                 任务流转前的硬性条件和 artifact 校验
```

ACP 的 `session/prompt.params.prompt[*].type` 标准类型只有：

```text
text
image
audio
resource_link
resource
```

不包括：

```text
role
specialist
system
```

因此 Kimi、Kilo 等 ACP provider 不会理解 `type: "role"` 或 `type: "specialist"`。Routa 如果要让 specialist prompt 生效，必须通过下列方式之一：

1. 在 Anthropic-compatible API 中发送顶层 `system`；
2. 在 OpenAI/OpenCode-compatible API 中发送 `messages[].role = "system"`；
3. 对标准 ACP provider，把 specialist prompt 与任务 prompt 合并成一个 `type: "text"` block；
4. 对 Claude CLI，使用其 append-system-prompt 路径。

## 2. `role` 与 `specialist`

### 2.1 `AgentRole` 没有 prompt

[`crates/routa-core/src/models/agent.rs`](../crates/routa-core/src/models/agent.rs) 中的 `AgentRole` 只有：

```text
ROUTA
CRAFTER
GATE
DEVELOPER
```

这个 enum 本身没有 prompt 内容，主要用于：

- Agent 分类；
- Agent 持久化；
- parent/child Agent 关系；
- 任务编排和状态；
- 部分 provider/model 默认选择；
- step 和 Agent 的匹配。

### 2.2 项目中确实存在 CRAFTER prompt

虽然 `AgentRole::Crafter` 本身没有 prompt，但 Routa 有对应的 `SpecialistConfig::crafter()`，以及 Rust 内置 fallback：

[`crates/routa-core/src/orchestration/mod.rs`](../crates/routa-core/src/orchestration/mod.rs)

```rust
const CRAFTER_SYSTEM_PROMPT: &str = ...;
const CRAFTER_ROLE_REMINDER: &str = ...;
```

此外还有 YAML 版本：

[`resources/specialists/core/crafter.yaml`](../resources/specialists/core/crafter.yaml)

Kanban Dev lane 使用的具体 specialist 是：

[`resources/specialists/workflows/kanban/dev-executor.yaml`](../resources/specialists/workflows/kanban/dev-executor.yaml)

```yaml
id: "kanban-dev-executor"
name: "Dev Crafter"
role: "CRAFTER"
```

该 YAML 的 prompt 是 Dev lane 专用契约，包括：

- 检查 story 是否可执行；
- 缺少 Acceptance Criteria、Execution Plan 等时退回 Todo；
- 只实现当前卡片范围；
- 运行验证；
- 写入 Dev Evidence；
- commit 实现；
- 确认 worktree clean；
- 最后移动到 Review。

### 2.3 role 字符串与 specialist ID 不等价

`SpecialistConfig::resolve("CRAFTER")` 会优先解析到 Rust 内置的通用 CRAFTER fallback。

```text
"CRAFTER"
  -> AgentRole::Crafter
  -> SpecialistConfig::crafter()
```

而：

```text
"kanban-dev-executor"
  -> SpecialistLoader
  -> resources/specialists/workflows/kanban/dev-executor.yaml
```

因此通用 `CRAFTER` 和 `kanban-dev-executor` 不是同一个 prompt。

## 3. specialist 的实际消费者

### 3.1 RoutaOrchestrator / `delegate_task_to_agent`

[`crates/routa-core/src/orchestration/mod.rs`](../crates/routa-core/src/orchestration/mod.rs) 的 `delegate_task_with_spawn` 会：

1. resolve specialist；
2. 根据 specialist role 选择默认 provider；
3. 创建 Agent 记录；
4. 将 `system_prompt`、任务上下文、验收标准、验证命令和 `role_reminder` 拼成完整字符串；
5. 创建 ACP session；
6. 发送合并后的普通文本 prompt。

这一条路径中 specialist prompt 会生效，但不是通过 ACP 新增的 ContentBlock 类型生效。

### 3.2 Workflow Executor

Workflow YAML 可以写：

```yaml
steps:
  - specialist: developer
```

WorkflowExecutor 将 specialist 的 `system_prompt`：

- 发送 Anthropic-compatible API 的顶层 `system`；
- 或发送 OpenAI/OpenCode-compatible API 的 `messages[].role = "system"`。

### 3.3 Routa `/api/acp` facade

Routa 自己的 `/api/acp` facade 在外层 `session/new` 支持扩展字段：

```json
{
  "role": "CRAFTER",
  "specialistId": "kanban-dev-executor",
  "systemPrompt": "..."
}
```

这些字段不是下游 ACP 标准字段，而是 Routa facade 的扩展。

第一次 `session/prompt` 时，标准 ACP provider 会将 specialist prompt 前置到普通文本 prompt：

```text
specialist system prompt

---

actual task prompt
```

### 3.4 Review、Canvas、CLI

Review API、Canvas specialist session、CLI agent/team/review 路径也会加载 specialist，并通过 API system message、Claude CLI 的 system prompt 选项，或普通文本拼接来注入职责 prompt。

## 4. 当前 Kanban Rust direct ACP 路径

核心路径：

[`crates/routa-core/src/rpc/methods/kanban/automation.rs`](../crates/routa-core/src/rpc/methods/kanban/automation.rs)

当前流程是：

```text
读取 task.assigned_provider / assigned_role
  -> AcpManager::create_session(..., role, ...)
  -> 构造 Kanban task prompt
  -> AcpManager::prompt(session_id, prompt)
```

当前没有：

- 根据 `assigned_specialist_id` 调用 `SpecialistConfig::resolve`；
- 加载 `kanban-dev-executor.yaml`；
- 将 specialist `system_prompt` 注入第一次 ACP text prompt；
- 将 specialist `role_reminder` 注入第一次 ACP text prompt。

因此当前 Dev direct path 的状态是：

```text
role metadata                 生效
specialistId assignment       被保存和匹配，但没有加载 prompt
specialistName                 用于展示和追踪
kanban task prompt             生效
kanban-dev-executor YAML       当前没有注入
```

这是当前最重要的实现缺口。

## 5. Automation step 的四个字段

默认 Review 配置：

```rust
vec![
    recommended_step("qa-frontend", "GATE", "QA Frontend"),
    recommended_step("review-guard", "GATE", "Review Guard"),
]
```

这不是集合并集，而是一个有序的 `Vec<KanbanAutomationStep>` 配置：

```text
Step 0: QA Frontend
Step 1: Review Guard
```

注意：数组有顺序不等于 runtime 会依次执行两个 Agent。当前 task automation dispatch 只解析 `primary_step()`，因此实际自动触发的是第一个有效 step；后续 step 目前主要用于匹配和 Review 收敛判断。

`recommended_step` 生成四个字段：

```text
id              = "qa-frontend"
role            = "GATE"
specialist_id   = "kanban-qa-frontend"
specialist_name = "QA Frontend"
```

### 5.1 `id`

automation step 自己的内部 ID，例如 `qa-frontend`、`review-guard`。

它不是 specialist ID。当前主要写入 `TaskLaneSession.step_id`，用于记录该 session 属于哪个 automation step。

### 5.2 `role`

复制到 task/session metadata，并参与 step 匹配；当前 direct ACP path 不会用它加载 prompt。

### 5.3 `specialistId`

复制到 `task.assigned_specialist_id` 和 `TaskLaneSession.specialist_id`，用于识别当前 automation step、Review step 推进和状态匹配。

在 step 匹配中，specialist ID 的匹配权重最高，但这仍然是控制面行为，不等于 prompt 注入。

### 5.4 `specialistName`

主要用于展示、session 追踪和 step 匹配辅助。

### 5.5 当前路径的结论

```text
四个字段都不是 ACP prompt 内容。
specialistId 是最重要的 specialist 身份字段，
但在当前 Kanban direct ACP trigger 中仍然没有触发 SpecialistConfig::resolve。
```

## 6. Screenshot / Evidence Bundle / Gate

### 6.1 默认 screenshot gate 是代码硬编码

默认 Review automation 中写死：

```rust
required_artifacts = ["screenshot", "test_results"]
```

位置：

[`crates/routa-core/src/models/kanban.rs`](../crates/routa-core/src/models/kanban.rs)

它的含义是：默认情况下，卡片移动到 Review 前必须存在 screenshot 和 test_results artifact。

### 6.2 没有前端项目自动检测

当前 Kanban Rust 路径没有发现：

```text
projectType
isFrontend
frontendOnly
uiOnly
browserVisible
```

也没有根据仓库语言、文件路径、任务标签或标题动态决定 screenshot policy。

因此当前实际是：

```text
不是“前端项目才要求截图”
而是“默认 Review 列统一要求截图”
```

`requiredArtifacts` 是列级 automation 配置，也可以由自定义 Kanban YAML 显式配置；它不是自动推导的项目类型。

### 6.3 QA prompt 与 Rust gate 存在不一致

`kanban-qa-frontend` prompt 说：

```text
如果是 backend-only 且没有浏览器可见变化，可以说明原因并跳过视觉 QA。
```

但 Rust gate 仍会无条件检查 Review 列的 `required_artifacts`。

因此存在不一致：

```text
specialist prompt：后端任务可以解释后跳过视觉 QA
Rust transition gate：默认 Review 仍要求 screenshot
```

### 6.4 `## Evidence Bundle` 的来源

在当前 `crates/routa-core/src/rpc/methods/kanban/automation.rs` 路径中，Dev task prompt 会拼出：

```text
## Evidence Bundle

Artifacts total: ...
Artifacts by type: ...
Required artifacts satisfied: no
Missing required artifacts: screenshot
Verification verdict: ...
```

它读取当前列的下一列配置，也就是 Dev -> Review 的 required artifacts。

所以 Dev Agent 在初始 prompt 中可能已经看到：

```text
Missing required artifacts: screenshot
```

模型可能将其转述成：

```text
最后必须提供截图作为证据
```

注意：`crates/routa-server/src/api/tasks_automation.rs` 中的另一套旧/替代 prompt builder 没有完整的 `## Evidence Bundle` 章节。因此是否出现该章节取决于实际触发路径。

### 6.5 Gate 报错的来源

如果 Agent 先调用：

```text
routa-coordination_move_card
```

Rust 会在移动到 Review 前检查 artifact。缺少 screenshot 时返回：

```text
Cannot move card to "Review": missing required artifacts: screenshot.
Please provide these artifacts before moving the card.
```

MCP executor 会把这个错误作为 tool result 返回给 Agent。

因此如果 transcript 顺序是：

```text
Agent: move_card
Tool: missing required artifacts: screenshot
Agent: 必须补充截图证据
```

那么来源是 Gate 报错，不是 specialist prompt。

### 6.6 如何从 transcript 判断来源

```text
首次任务 prompt 中出现 Evidence Bundle
    -> 初始 Context

紧跟在 move_card 调用失败后出现
    -> Gate error

出现在 QA/Review specialist session 启动后
    -> specialist prompt
```

针对当前 Dev direct ACP path，Review specialist prompt 不会自动注入，因此第三种来源可以排除。

## 7. 当前推荐的关注范围

后续讨论应优先关注：

```text
kanban-dev-executor.system_prompt
kanban-dev-executor.role_reminder
Evidence Bundle 的动态内容
required_artifacts 的列级配置
move_card 的 transition gate
```

`AgentRole::CRAFTER` 可以作为背景 metadata 保留，但不应把它当作当前 Dev Agent 的 prompt 来源。

## 8. 待改造问题

如果希望 Kanban Dev/Review 真正使用 specialist prompt，触发路径需要：

1. 根据当前 automation step 的 `specialist_id` resolve specialist；
2. 获取 `system_prompt` 与 `role_reminder`；
3. 对 ACP provider 合并成一个 `type: "text"` prompt；
4. 对 Claude 或兼容 system message 的 adapter 使用其原生 system prompt 能力；
5. 保留 `role`、`id`、`specialistName` 作为控制面和追踪 metadata；
6. 重新决定 screenshot gate 是否应按任务的 browser-visible/UI 属性，而不是默认对所有 Review 任务生效。

## 9. Lane/Task 的 Entry、Execute、Exit 三阶段理解

### 9.1 结论

把一个 lane 中 specialist 的工作理解为：

```text
Entry Gate -> Execute / Mission -> Exit Gate
```

作为 specialist prompt 的阅读方式是基本正确的。但这不是 Rust runtime 中统一定义的三阶段状态机，也不是每个 lane 都严格拥有三个阶段。

### 9.2 Specialist prompt 中的实际结构

Kanban specialist YAML 确实使用 `Entry Gate`、`Mission`/执行内容、`Exit Gate` 这些术语：

- `todo-orchestrator`：Entry Gate -> Execution Plan -> Exit Gate。
- `dev-executor`：Entry Gate -> 实现任务 -> Exit Gate。
- `review-guard`：Entry Gate -> Review Checklist/审查 -> Exit Gate。
- `backlog-refiner`：主要是 Mission 和 Exit Gate，没有同样明确的 Entry Gate 标题。
- `done-reporter`：只有 Entry Gate；Done 是终止列，没有继续推进的 Exit Gate。
- `qa-frontend`：以 Mission、Required Checks、Completion 为主，没有标准的 Entry/Exit Gate 标题。

因此，三阶段是常见的 prompt 行为模式，不是所有 specialist 的强制格式。

### 9.3 Rust runtime 的正式术语和实现

Rust 数据模型使用的是：

- `KanbanColumnAutomation`：列级自动化配置；
- `KanbanAutomationStep`：列内有序步骤，可能有多个；
- `transition_type`：`entry`、`exit` 或 `both`，决定在哪种列转换时触发自动化；
- `primary_step`：当前列初始触发的主要步骤；
- `TaskLaneSession`：实际 ACP/A2A session 的运行记录；
- transition gates：目标列上的 `required_artifacts`、`required_task_fields`、checklist、approval、validator 和 `gate_mode` 等门禁。

推荐默认配置的 `transition_type` 是 `entry`。在普通 `move_card` 转列路径中，Rust 先执行目标列的 required artifact/task-field/transition gate 检查，然后根据该列的 automation 触发 primary step 的 Agent session。Agent 在 session 中通过 ACP prompt 执行 lane 工作，并通过下一次 `move_card` 请求离开当前列；那一次调用检查的是下一目标列的门禁。直接创建到某列的路径不完全经过同一套 move gate。

### 9.4 两套“Gate”不要混淆

1. **Prompt Gate**：YAML specialist prompt 中的 `## Entry Gate` / `## Exit Gate`，是 Agent 按文字执行的自检和工作契约。
2. **Runtime transition gate**：Rust 的 `ensure_required_artifacts_present`、`ensure_required_task_fields_present`、`ensure_transition_gates_satisfied` 等代码检查，是 `move_card` 转列时的硬性或 warning 门禁。

所以更准确的运行模型是：

```text
卡片进入列
  -> Rust transition gate（目标列配置）
  -> 触发 primary automation step
  -> 创建 TaskLaneSession / ACP session
  -> 发送 task prompt，Agent 执行 lane mission
  -> Agent 调用 move_card
  -> Rust 在下一次转列时做下一目标列的 transition gate
  -> 转列并结束/交接 lane session
```

这里的 Execute 对应 Agent session 的 prompt 执行，不是一个名为 `ExecuteGate` 的 Rust 状态；Entry/Exit 也不保证各自只有一次或恰好包围整个 session。

### 9.5 Review 的 `steps` 数组当前并不等于多次执行

当前两个 automation dispatch 实现都会调用 `automation.primary_step()`，而 `resolve_task_automation_step` 也只返回这个 primary step。触发 ACP/A2A 时只使用这个返回值；`TaskLaneSession.step_index` 在这些路径中写入的是 `None`，没有循环执行 `steps[1]`、`steps[2]` 的逻辑。

因此 Review 默认配置中的：

```text
qa-frontend -> review-guard
```

目前不能描述为“两个实际连续执行的 Agent 步骤”。第二项主要参与 `resolve_review_lane_convergence_column` 的收敛判断：系统判断当前 specialist 是否已经是最后一个 review step，从而决定验证结果能否把卡片推进到 Done/Dev。它本身不会自动启动 `review-guard` session。

### 9.6 transition gate 是否必然执行两次

不是“每个 lane 固定执行一次 Entry Gate、一次 Exit Gate”。实际是：每次普通跨列 `move_card` 调用，在目标列不同于当前列时执行一次目标列 transition gate。一个卡片如果成功经历 `Dev -> Review -> Done`，会分别检查 Review 和 Done 的目标列门禁；如果创建时直接落入某列、没有跨列、Agent 没有调用 `move_card`，或调用失败，就不会形成固定的两次检查。

`transition_type = entry | exit | both` 主要决定自动化触发来源列/目标列，不会把 runtime 拆成显式的 Entry Gate 和 Exit Gate 两个状态。

### 9.7 当前最简准确表述

对当前 Rust Server 的默认 Kanban 流程，可以直接表述为：

1. Agent 在当前 lane 的 ACP session 中工作。
2. Agent 认为当前 lane 完成后，主动调用 `move_card`。
3. `move_card` 只对 target lane 执行一次 transition gate 检查。
4. 检查失败，卡片保持在原 lane；检查通过，卡片进入 target lane，并触发 target lane 的 primary automation。
5. 当前没有独立的 runtime exit gate，也没有 runtime 自动判断 Agent 是否“做完”。

这里的“target lane gate”是便于理解的说法；代码中的正式名称仍然是 transition gate。

### 9.8 `transition_type` 在 Rust task automation 中的实际情况

模型上三种值的意图是：

- `entry`：进入目标列时触发；
- `exit`：离开源列时触发；
- `both`：进入或离开时都触发。

但当前 Rust runtime 不是完整实现：

- `entry`：普通 `move_card` 进入目标列时可正常触发，也是默认配置。
- `both`：目标列作为 entry 时可触发。若源列是 `both`，选择逻辑会优先选源列，但后续 Agent dispatch 仍按卡片当前所在的目标列解析，存在 source/target 错位；不能把它视为可靠的“离开源列执行一次”。
- `exit`：`move_card` 的选择逻辑会识别源列的 `exit`，但 `maybe_trigger_lane_automation` 随后明确过滤掉 `exit`，因此不会真正创建 task Agent session。重启恢复逻辑也只处理 `entry`/`both`。

此外，显式的 `kanban.triggerAutomation` 会直接触发所选列的 primary automation，task API 的创建/更新触发也主要依据“列是否有 enabled automation”，并不严格按 `transition_type` 过滤。这些是手动/替代入口，不能证明 `exit` 在正常列转换自动化中可用。

## 10. 最终结论：当前 Rust task automation 的真实模型

本文后续讨论只把“实际会执行的 runtime 行为”作为结论，不把 specialist prompt 或未被 dispatch 的 metadata 当成执行步骤。

### 10.1 正常 `move_card` 路径

```text
Agent 在当前 lane 的 ACP session 中执行 generic Kanban task prompt
  -> Agent 认为完成，调用 move_card(targetColumnId)
  -> 对 target lane 执行一次 transition gate 检查
  -> 失败：卡片保持原 lane，返回错误
  -> 成功：卡片进入 target lane
  -> 触发 target lane 的 primary automation（默认 transition_type=entry）
```

这里没有独立的 runtime exit gate，也没有 Rust 代码自动判断 Agent 是否已经完成当前 lane。

### 10.2 Gate 的实际含义

`transition gate` 是列转换前对 target lane 配置的检查，当前包括：

- `required_artifacts`；
- `required_task_fields`；
- required checklist；
- human approval；
- validator evidence；
- `gate_mode`（默认阻塞，Warning 时只记录警告）。

它不是 `Entry Gate` / `Exit Gate` 两个状态机阶段。一次普通跨列调用检查一次 target lane；`Dev -> Review -> Done` 会因为有两次跨列而分别检查 Review 和 Done。

### 10.3 `transition_type` 的有效性

在正常自动化路径中：

| 值 | 实际结论 |
|---|---|
| `entry` | 可用；进入 target lane 时触发，当前默认值 |
| `both` | target 作为 entry 时可用；source 作为 exit 时存在 source/target 解析错位，不应视为可靠的 exit 执行 |
| `exit` | 选择逻辑会识别，但实际 dispatch 会过滤，正常 `move_card` 不会创建 Agent session |

### 10.4 不同触发入口不能混为一谈

- `move_card`：执行 target gate，再按 transition 选择逻辑尝试触发 automation。
- `kanban.triggerAutomation`：显式手动触发所选列的 primary automation，绕过正常 transition timing。
- Task API 创建/更新：看到目标列存在 enabled automation 就可能触发，当前没有严格按 `transition_type` 过滤。
- Kanban lazy recovery：只恢复 `entry` / `both`，不恢复 `exit`。

因此，若只问默认 Kanban Agent 的正常 task automation，实际有效模型可以压缩成：

```text
Agent session -> Agent 调用 move_card -> target transition gate -> target primary automation
```

Review 配置中的 `qa-frontend`、`review-guard` 目前不能当作两个已实现的连续 Agent 执行步骤；自动 dispatch 只执行 primary step。
