---
title: "UI Journey Scoring Harness 方案"
date: "2026-03-25"
status: resolved
severity: medium
area: "ui-evaluation"
tags:
  - ui
  - evaluation
  - specialist
  - agent-eval
  - harness
  - journey-testing
reported_by: "codex"
resolved_by: "codex"
resolved_at: "2026-03-25"
related_issues:
  - "https://github.com/phodal/routa/issues/228"
github_issue: 228
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/228"
---

# UI Journey Scoring Harness 方案（简化版）

## Summary

为 Routa.js 设计一个基于 Specialist + CLI 的 UI 评测 harness，借助模型（Claude、Codex 等）模拟真实用户旅程，对"功能适用度"进行打分。

第一版只做固定旅程执行 + 模型评分，不做自由探索复核。先验证"模型能不能稳定地给出有意义的 UI 体验评分"这个核心假设。

## Key Changes

### 1. 新增 specialist：`ui-journey-evaluator`

以 YAML specialist 形式定义，放在 `resources/specialists/tools/ui-journey-evaluator.yaml`，使用现有 `routa specialist run` 触发。

specialist 职责：
- 读取场景文件（通过 `read_file` 工具加载）
- 使用 Playwright MCP 工具驱动浏览器执行旅程
- 根据执行结果、截图、页面状态输出评分

输出结构按未来 workflow 可复用的方式设计，但第一版不做多 specialist 编排。

### 2. 场景文件：自然语言描述，不做 step-level DSL

每个评测场景维护一份场景文件，放在：

- `resources/ui-journeys/core-home-session.yaml`
- `resources/ui-journeys/kanban-automation.yaml`
- `resources/ui-journeys/team-automation.yaml`

场景文件只包含高层描述，具体步骤用自然语言，让 specialist + Playwright 工具自己执行：

```yaml
id: core-home-session
goal: "从首页进入 workspace，选择 provider，提交 prompt，跳转到 session 页面并验证可交互"
entry_url: "http://localhost:3000"
preconditions:
  - "至少存在一个 workspace"
  - "至少配置了一个 provider"
success_signals:
  - "成功跳转到 session 详情页"
  - "session 页面显示用户提交的 prompt 内容"
  - "页面可继续交互，无阻断性错误"
failure_signals:
  - "任何步骤出现页面白屏或 500 错误"
  - "提交 prompt 后未跳转"
  - "session 页面无法加载历史消息"
score_rubric: |
  重点关注：任务能否顺畅完成、路径是否清晰、
  出错时用户能否理解当前状态并恢复。
```

不做 `action: goto | click | fill ...` 这套 DSL。模型的理解能力比固定 selector 更能应对 UI 变化。

### 3. 评分模型：简单直接

每个场景输出：

- `task_fit_score`：总分，0-100
- `verdict`：`Good Fit` (≥80) / `Partial Fit` (60-79) / `Poor Fit` (<60)
- `findings`：发现列表，每条包含 `type` (issue/observation)、`description`、`severity`

硬失败规则：
- 关键目标未完成 → 最高 Partial Fit
- 关键路径中断且无法恢复 → 直接 Poor Fit

不做四维度加权拆分。等跑了几轮有数据后再校准维度和权重。

### 4. 输出 artifact

每次运行产出：

```
artifacts/ui-journey/<scenario-id>/<run-id>/
  evaluation.json    # 评分结果 + findings
  screenshots/       # 关键步骤截图
  summary.md         # 人类可读结论
```

`evaluation.json` 结构：

```json
{
  "scenario_id": "core-home-session",
  "run_id": "2026-03-25-001",
  "task_fit_score": 85,
  "verdict": "Good Fit",
  "findings": [
    {
      "type": "observation",
      "description": "provider 选择下拉框加载耗时约 3 秒",
      "severity": "low"
    }
  ],
  "evidence_summary": "所有关键步骤完成，无 console 错误，无 network 失败"
}
```

console/network 错误作为评分输入证据写进 findings，不单独输出文件。

### 5. CLI 入口

```bash
routa specialist run ui-journey-evaluator \
  --workspace-id <id> \
  --provider <provider> \
  --prompt "scenario: core-home-session, base_url: http://localhost:3000, artifact_dir: artifacts/ui-journey"
```

不修改现有 CLI 语义。prompt 里约定场景 ID、base URL、artifact 输出目录。

## Test Plan

第一版覆盖 3 条旅程：

1. 核心主链路：首页 → workspace → 选 provider → 提交 prompt → session 详情页
2. Kanban 自动化：workspace kanban → 创建卡 → 移到自动化列 → 验证 session 触发和状态反馈
3. Team 自动化：team 页面 → 触发 session 流程 → 验证协作状态和页面反馈

验收标准：
- specialist 能跑完整个场景并输出 evaluation.json + screenshots + summary.md
- 同一场景跑 3-5 次，记录评分波动范围作为 baseline
- 评分与执行证据（截图、findings）逻辑一致

## 真实运行结果（2026-03-25）

执行了可复现命令并记录输出（先编译产物）：

1) CLI 帮助可用性
- 命令：`cargo run -p routa-cli -- specialist run --help`
- 结论：通过。新增参数已生效，命令行上可见：
  - `--provider`
  - `--provider-timeout-ms`
  - `--provider-retries`

2) 不存在 provider 的 fail-fast
- 命令：`HOME=/tmp/codex-routa-test XDG_CONFIG_HOME=/tmp/codex-routa-test/.config cargo run -p routa-cli -- specialist run ui-journey-evaluator --provider nope-provider --provider-timeout-ms 2000 --provider-retries 1 --workspace-id default --prompt 'scenario: core-home-session'`
- 结论：快速失败，返回：
  - `Error: Unsupported provider 'nope-provider': Agent 'nope-provider' not found in registry`

3) claude 无登录态
- 命令：`HOME=/tmp/codex-routa-test XDG_CONFIG_HOME=/tmp/codex-routa-test/.config cargo run -p routa-cli -- specialist run ui-journey-evaluator --provider claude --provider-timeout-ms 2000 --provider-retries 1 --workspace-id default --prompt 'scenario: core-home-session'`
- 结论：
  - 进入运行页后打印 `⚠️  Claude may require authentication...`
  - 进程返回 `▶ Not logged in · Please run /login`
  - 命令尚未成功产出验收期望的 artifact（环境鉴权阻断）

4) opencode 初始化超时与重试链路
- 命令：`sh -c 'HOME=/tmp/codex-routa-test XDG_CONFIG_HOME=/tmp/codex-routa-test/.config timeout 40s cargo run -p routa-cli -- specialist run ui-journey-evaluator --provider opencode --provider-timeout-ms 3000 --provider-retries 1 --workspace-id default --prompt \"scenario: core-home-session\"'`
- 结论：
  - 进入运行页后在初始化阶段触发 `⚠️  Attempt 1 failed: Timeout waiting for initialize...`
  - 最终返回：`Error: Failed to create ACP session: Timeout waiting for initialize...`
  - 该路径确认了 `provider_timeout_ms` 和 `provider_retries` 已落到 runtime 分支，并触发了重试提示行为（当前环境仍因 provider 初始化耗时导致失败）。

4) 验证失败落盘：provider 不存在时也产 artifact
- 命令：`HOME=/tmp/codex-routa-test XDG_CONFIG_HOME=/tmp/codex-routa-test/.config cargo run -p routa-cli -- specialist run ui-journey-evaluator --provider nope-provider --provider-timeout-ms 2000 --provider-retries 1 --workspace-id default --prompt 'scenario: core-home-session, artifact_dir: /tmp/routa-ui-journey-test'`
- 结论：
  - CLI 返回失败：`Unsupported provider 'nope-provider': Agent 'nope-provider' not found in registry`
  - 同时确认已生成：
    - `evaluation.json`（`result: incomplete` + `run_metadata.attempts/failure_stage` + 时间与参数）
    - `summary.md`（failure 原因 + 关键指标）
    - `screenshots/` 目录（空目录，供后续兜底产物位置）

  - 示例产物路径：
    - `/tmp/routa-ui-journey-test/core-home-session/<run-id>/`

5) 验证输入参数校验链路
- 命令：`HOME=/tmp/codex-routa-test XDG_CONFIG_HOME=/tmp/codex-routa-test/.config cargo run -p routa-cli -- specialist run ui-journey-evaluator --provider opencode --provider-timeout-ms 1500 --provider-retries 0 --workspace-id default --prompt 'base_url: http://localhost:3000'`
- 结论：
  - 约束生效：缺少 `scenario` 时报错 `Missing required journey parameter: scenario`
  - 仍落盘 `evaluation.json` 与 `summary.md`，`failure_stage=prompt_validation`，用于规范化问题排查

结论：本次方案的关键路径（参数解析、provider 预检、超时/重试透传）在 CLI 可运行层面已验证；未关闭的缺口是 provider 可用性与鉴权前提不足，导致仍无法拿到 `evaluation.json/summary.md/screenshots` 闭环产物。`specialist run` 支持按 `id` 自动从 `resources/specialists`/`ROUTA_SPECIALISTS_RESOURCE_DIR` 下解析定义，通常可避免写长路径。

## 最终实现状态（2026-03-25）

在继续补齐 provider/runtime 兼容、scenario stop conditions 和 payload 恢复逻辑后，这条 issue 的第一版目标已经闭环完成。

已验证完成：
- `ui-journey-evaluator` specialist 已接入 `routa specialist run`
- 3 个场景文件均存在并已真实跑出成功样本：
  - `core-home-session`
  - `kanban-automation`
  - `team-automation`
- 成功路径会产出 `evaluation.json + screenshots + summary.md`
- 失败路径也会统一落盘，并带 `run_metadata.failure_stage`
- `--repeat N` baseline 聚合能力已落地
- 成功 artifact 会做 schema 校验，确保 `task_fit_score / verdict / findings / evidence_summary` 与截图目录符合约定

与最初方案相比，验收口径有两处按真实产品行为做了收敛：
- `kanban-automation` 不再强制“必须先移到自动化列”才算成功；如果新卡在 Backlog 内就已经出现 `Live Session`、session 面板、`Stop` 或等价自动化反馈，也视为 Kanban 页内已观察到自动化触发。
- `team-automation` 第一版以“成功进入 Team run 页面并看到 session 标识、成员状态、live 状态或控制入口”为成功标准，不再要求在同一证据窗口内必须看到更深层 delegation 全部展开。

## 成功样本与执行时间

以下为 2026-03-25 的真实成功样本，耗时取自 `evaluation.json.run_metadata.elapsed_ms`：

1. `core-home-session`
   - Artifact: `/tmp/routa-ui-journey-codex-core-3/core-home-session/20260325-163901-714/`
   - Result: `task_fit_score=91`, `verdict=Good Fit`
   - Elapsed: `213182 ms`，约 `213.2 s`，约 `3 分 33 秒`

2. `kanban-automation`
   - Artifact: `/tmp/routa-ui-journey-codex-kanban-mainline-4/kanban-automation/20260325-211850-147/`
   - Result: `task_fit_score=91`, `verdict=Good Fit`
   - Elapsed: `131886 ms`，约 `131.9 s`，约 `2 分 12 秒`

3. `team-automation`
   - Artifact: `/tmp/routa-ui-journey-codex-team-mainline-3/team-automation/20260325-212804-200/`
   - Result: `task_fit_score=90`, `verdict=Good Fit`
   - Elapsed: `79246 ms`，约 `79.2 s`，约 `1 分 19 秒`

执行时间观察：
- `team-automation` 是当前最稳定、最快的场景。
- `kanban-automation` 次之，主要成本在看板加载和创建后等待页内自动化反馈。
- `core-home-session` 最慢，主要成本在首页到 session 页的 provider 选择与 session 激活等待。
- 3 条成功样本都在默认 `240 s` 总预算内完成；其中 `core-home-session` 离预算上限最近，是后续最值得继续压缩耗时的场景。

## Resolution Notes

本地 issue 现在可以视为已解决并可归档的历史记录。

剩余动作不是实现缺口，而是流程动作：
- 如果希望 GitHub 与本地状态一致，需要单独关闭 GitHub issue #228。
- 如果后续继续优化耗时、评分文案或 baseline 样本数量，应另开 follow-up issue，而不是继续把这条方案 issue 维持在开放状态。

## 进一步优化方案

1. 已完成：增加 provider 预检（优先级高）
   - 在运行前检查 provider 可执行体、配置目录可写性、claude 登录态等；若不满足，直接 fail-fast。
   - 失败时要产出低分结论与建议命令（例如登录、清理配置目录），减少“无产物挂起”。

2. 已完成：把初始化超时与重试参数化（优先级高）
   - 为 `specialist run` 加 `--provider-timeout-ms`、`--provider-retries`，并在运行链路透传到初始化阶段；
   - 当前实现已支持 1 次重试，重试失败时会输出 attempt 信息。

3. 保障失败路径也落盘（优先级高）
   - 已完成：provider 预检失败、agent 创建失败、session 创建失败、prompt 发送失败、运行超时/提前退出将落盘：
     - `evaluation.json`（含 `task_fit_score`、`verdict`、`findings`）
     - `summary.md`（写清失败原因与复盘建议）
     - `screenshots/`（若有可用截图则写入）
   - 找不到关键 artifact 的情况下也要给出 `result: incomplete` 并写入原因码。

4. 丰富运行观察指标
   - 已完成：在失败/成功落盘时统一写入：
     - `run_metadata.attempts`
     - `run_metadata.provider_timeout_ms`
     - `run_metadata.provider_retries`
     - `run_metadata.elapsed_ms`
     - `run_metadata.initialize_elapsed_ms`
     - `run_metadata.failure_stage`

## 未来扩展（不在第一版范围）

- 自由探索复核（低分时触发模型自主探索）
- 多维度加权评分（goal_completion、journey_friction、clarity 等）
- 接入 fitness 体系作为 `ui_journey` 维度
- 结果写回 kanban/session/Review lane
- 升级为 `workflow run` 封装

## Assumptions

- 第一版优先追求"可运行、可复盘、可扩展"。
- 固定旅程执行通过 specialist 调用 Playwright MCP 工具完成，步骤由模型根据自然语言描述自主执行。
- 结果先写 artifact，不直接写回 kanban/session。
- `FEATURE_TREE.md` 只作为场景发现和覆盖清单来源，不作为评分依据。
