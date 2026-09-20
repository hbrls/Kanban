---
title: "[GitHub #67] feat(provider): Dynamic Provider Selection Based on Agent Capabilities"
date: "2026-03-06"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-67", "enhancement"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/67"]
github_issue: 67
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/67"
---

# [GitHub #67] feat(provider): Dynamic Provider Selection Based on Agent Capabilities

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #67
- URL: https://github.com/phodal/routa/issues/67
- State: closed
- Author: phodal
- Created At: 2026-03-06T04:04:25Z
- Updated At: 2026-03-06T04:04:25Z

## Labels

- `enhancement`

## Original GitHub Body

## 用户故事

作为一个使用多个 ACP Provider 的用户，我希望 master agent（Routa）和 workspace agent 能够根据每个 provider 的 agent 能力和模型描述，自动选择最合适的 provider 来创建子 agent，而不是依赖静态配置或手动指定，从而让多 agent 协作更智能、更高效。

---

## 背景

当前系统中用户可以配置多个 ACP Provider（opencode、gemini、copilot、kimi、kiro、claude 等），每个 provider 的能力存在差异：
- 支持的工具集不同（如 mcp_tool 支持情况）
- 模型能力层级不同（fast / balanced / smart）
- 适合的 agent 角色不同（ROUTA / CRAFTER / GATE / DEVELOPER）

目前 provider 选择逻辑是静态的（env var 或显式指定），master agent 无法感知各 provider 的实际能力差异来做动态路由。

---

## Acceptance Criteria

### AC1: Provider 能力描述元数据
- [ ] `AcpAgentPreset` 增加 `capabilities` 字段，描述该 provider 支持的能力集合（如 `mcp_tool`、`file_edit`、`web_search` 等）
- [ ] `AcpAgentPreset` 增加 `supportedRoles` 字段，标注该 provider 适合承担的 agent 角色
- [ ] `AcpAgentPreset` 增加 `preferredTier` 字段，标注该 provider 的默认模型能力层级
- [ ] 现有静态 preset（opencode、gemini、copilot 等）补充对应的能力元数据

### AC2: Provider 能力查询 API
- [ ] 提供 `getProviderCapabilities(providerId)` 方法，返回该 provider 的能力描述
- [ ] 提供 `findProvidersByCapability(capability)` 方法，按能力筛选可用 provider 列表
- [ ] 提供 `findBestProviderForRole(role, availableProviders)` 方法，根据 agent 角色返回最优 provider

### AC3: Master Agent 动态 Provider 路由
- [ ] Routa coordinator 在创建子 agent（CRAFTER / GATE）时，能从已配置的 provider 列表中动态选择
- [ ] 选择逻辑优先考虑：任务所需能力匹配 → 角色适配性 → 模型层级
- [ ] 当任务需要 `mcp_tool` 能力时，自动过滤掉不支持该能力的 provider
- [ ] 选择结果记录在 session metadata 中，便于追踪和调试

### AC4: Task Panel UI — Provider 选择增强
- [ ] Task Panel 中创建新 task / agent 时，展示可用 provider 列表及其能力标签
- [ ] 用户可手动指定 provider，也可选择「自动选择」让系统根据能力匹配
- [ ] 显示每个 provider 的能力徽章（如 `mcp`、`web`、`file`）
- [ ] 当某 provider 不支持当前任务所需能力时，在 UI 中给出提示或禁用该选项

### AC5: Workspace Agent 能力感知
- [ ] `WorkspaceAgentConfig` 支持声明所需能力（`requiredCapabilities`）
- [ ] workspace agent 在初始化时，根据所需能力从 provider registry 中自动选择合适的底层模型/provider
- [ ] 支持 fallback 策略：首选 provider 不可用时，自动降级到次优 provider

---

## 技术参考

相关文件：
- `src/core/acp/acp-presets.ts` — AcpAgentPreset 定义
- `src/core/acp/provider-registry.ts` — Provider 注册与模型 tier 解析
- `src/core/acp/agent-instance-factory.ts` — Agent 实例创建与 provider 解析
- `src/core/acp/workspace-agent/workspace-agent-config.ts` — Workspace agent 配置
- `src/client/components/task-panel.tsx` — Task Panel UI
- `src/core/models/agent.ts` — AgentRole / ModelTier 定义

---

## 备注

- 能力元数据初期可以是静态声明，后续可考虑通过 ACP 协议动态查询
- mcp_tool 支持情况是最关键的能力维度，需优先实现
- UI 部分可作为独立子任务拆分实现
