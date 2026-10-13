---
title: "[GitHub #15] Oracle OpenSpec 集成"
date: "2026-02-24"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-15"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/15"]
github_issue: 15
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/15"
---

# [GitHub #15] Oracle OpenSpec 集成

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #15
- URL: https://github.com/phodal/routa/issues/15
- State: closed
- Author: phodal
- Created At: 2026-02-24T08:14:41Z
- Updated At: 2026-02-24T08:22:04Z

## Labels

- (none)

## Original GitHub Body

## OpenSpec 集成实现方案分析

### 1. OpenSpec 简介

**Open Agent Specification (Agent Spec)** 是由 Oracle 开发的一个框架无关的声明式语言，用于定义 AI Agent 及其工作流。它类似于 ONNX 之于机器学习模型，旨在实现 Agent 在不同框架之间的可移植性和互操作性。

**核心特点：**
- **声明式配置**：使用 YAML/JSON 格式定义 Agent 和 Flow
- **框架无关**：可跨 LangGraph、AutoGen、CrewAI 等框架运行
- **组件化设计**：Agent、Flow、Tool、LLM 等模块化组件
- **MCP 兼容**：支持 Model Context Protocol

### 2. Routa 现有架构分析

当前 Routa 已支持的协议：
- **MCP (Model Context Protocol)** — 工具协调
- **ACP (Agent Client Protocol)** — Agent 进程管理
- **A2A (Agent-to-Agent Protocol)** — 跨平台 Agent 通信

**Routa Agent 模型现状：**
```typescript
interface Agent {
  id: string;
  name: string;
  role: AgentRole; // ROUTA | CRAFTER | GATE | DEVELOPER
  modelTier: ModelTier; // SMART | BALANCED | FAST
  workspaceId: string;
  parentId?: string;
  status: AgentStatus;
  metadata: Record<string, string>;
}
```

**Specialist 配置：**
```typescript
interface SpecialistConfig {
  id: string;
  name: string;
  description?: string;
  role: AgentRole;
  defaultModelTier: ModelTier;
  systemPrompt: string;
  roleReminder: string;
  source?: "user" | "bundled" | "hardcoded";
}
```

### 3. OpenSpec 与 Routa 的映射关系

| OpenSpec 组件 | Routa 对应 | 说明 |
|-------------|-----------|------|
| `Agent` | `SpecialistConfig` + `Agent` | Agent 定义与运行时实例 |
| `LLMConfig` | `ModelTier` + ACP Provider | 模型配置 |
| `Tool` | MCP Tools | 工具定义 |
| `Flow` | Task orchestration | 工作流编排 |
| `inputs/outputs` | Task scope/objectives | 输入输出 Schema |

### 4. 实现方案

#### Phase 1: OpenSpec Schema 支持

**4.1 创建 OpenSpec 类型定义**

```typescript
// src/core/openspec/types.ts
interface OpenSpecAgent {
  name: string;
  description?: string;
  system_prompt: string;
  llm_config: OpenSpecLLMConfig;
  tools?: OpenSpecToolRef[];
  inputs?: OpenSpecProperty[];
  outputs?: OpenSpecProperty[];
}

interface OpenSpecLLMConfig {
  name: string;
  model_id: string;
  // Provider-specific config
  provider_type?: 'openai' | 'anthropic' | 'ollama' | 'oci';
}

interface OpenSpecFlow {
  name: string;
  start_node: string;
  nodes: OpenSpecNode[];
  control_flow_connections: OpenSpecControlFlowEdge[];
  data_flow_connections?: OpenSpecDataFlowEdge[];
}

interface OpenSpecProperty {
  json_schema: {
    title: string;
    type: string;
    description?: string;
  };
}
```

**4.2 OpenSpec 解析器**

```typescript
// src/core/openspec/parser.ts
export function parseOpenSpecYAML(content: string): OpenSpecAgent | OpenSpecFlow;
export function parseOpenSpecJSON(content: string): OpenSpecAgent | OpenSpecFlow;
```

#### Phase 2: 双向转换器

**4.3 Routa → OpenSpec 导出**

```typescript
// src/core/openspec/exporter.ts
export function exportSpecialistToOpenSpec(
  specialist: SpecialistConfig
): OpenSpecAgent {
  return {
    name: specialist.name,
    description: specialist.description,
    system_prompt: specialist.systemPrompt,
    llm_config: {
      name: `${specialist.id}_llm`,
      model_id: modelTierToModelId(specialist.defaultModelTier),
    },
    // ... map MCP tools
  };
}

export function exportTaskGraphToOpenSpecFlow(
  tasks: Task[]
): OpenSpecFlow {
  // Convert task dependencies to Flow structure
}
```

**4.4 OpenSpec → Routa 导入**

```typescript
// src/core/openspec/importer.ts
export function importOpenSpecAgent(
  spec: OpenSpecAgent
): SpecialistConfig {
  return {
    id: slugify(spec.name),
    name: spec.name,
    description: spec.description,
    role: inferRoleFromPrompt(spec.system_prompt),
    defaultModelTier: inferModelTier(spec.llm_config),
    systemPrompt: spec.system_prompt,
    roleReminder: extractRoleReminder(spec.system_prompt),
    source: 'user',
  };
}
```

#### Phase 3: 文件格式支持

**4.5 支持 `.agentspec.yaml` 文件**

扩展现有 Skill 加载机制：

```typescript
// src/core/openspec/loader.ts
const OPENSPEC_PATTERNS = [
  '**/*.agentspec.yaml',
  '**/*.agentspec.json',
  '.agents/*.agentspec.yaml',
];

export function discoverOpenSpecFiles(workspaceDir: string): string[];
export function loadOpenSpecFromFile(filePath: string): OpenSpecAgent | OpenSpecFlow;
```

#### Phase 4: API 端点

**4.6 REST API**

```typescript
// /api/openspec/import - POST: Import OpenSpec YAML/JSON
// /api/openspec/export/[id] - GET: Export specialist to OpenSpec
// /api/openspec/validate - POST: Validate OpenSpec configuration
```

#### Phase 5: Rust 后端同步 (crates/routa-server)

```rust
// crates/routa-core/src/openspec/mod.rs
pub struct OpenSpecAgent {
    pub name: String,
    pub description: Option<String>,
    pub system_prompt: String,
    pub llm_config: OpenSpecLLMConfig,
    pub tools: Option<Vec<OpenSpecToolRef>>,
}

impl From<OpenSpecAgent> for SpecialistConfig { ... }
impl From<SpecialistConfig> for OpenSpecAgent { ... }
```

### 5. 文件结构

```
src/core/openspec/
├── types.ts           # TypeScript 类型定义
├── parser.ts          # YAML/JSON 解析
├── importer.ts        # OpenSpec → Routa 转换
├── exporter.ts        # Routa → OpenSpec 转换
├── loader.ts          # 文件发现与加载
├── validator.ts       # Schema 验证
└── index.ts           # 公开导出

crates/routa-core/src/openspec/
├── mod.rs             # Rust 模块
├── types.rs           # Rust 类型定义
└── converter.rs       # 转换逻辑
```

### 6. 示例 OpenSpec 文件

```yaml
# routa-crafter.agentspec.yaml
name: Routa Crafter
description: Implementation agent - writes code and makes changes
system_prompt: |
  You are a skilled implementation agent focused on writing high-quality code.
  You receive well-defined tasks and execute them precisely.
  Report completion status to your coordinator.
llm_config:
  name: crafter_llm
  model_id: claude-3-haiku
  provider_type: anthropic
tools:
  - $component_ref:mcp_file_tools
  - $component_ref:mcp_code_search
inputs:
  - json_schema:
      title: task_description
      type: string
      description: The implementation task to complete
outputs:
  - json_schema:
      title: completion_report
      type: object
```

### 7. 优先级与里程碑

| 阶段 | 任务 | 优先级 | 预估工作量 |
|-----|------|-------|----------|
| P1 | TypeScript 类型定义 | 高 | 1-2 天 |
| P1 | YAML/JSON 解析器 | 高 | 1 天 |
| P2 | Routa → OpenSpec 导出 | 中 | 2-3 天 |
| P2 | OpenSpec → Routa 导入 | 中 | 2-3 天 |
| P3 | API 端点 | 中 | 1-2 天 |
| P4 | Rust 后端同步 | 低 | 3-4 天 |
| P5 | 文档与示例 | 低 | 1 天 |

### 8. 开放问题

1. **Flow 支持范围**：是否需要完整支持 OpenSpec Flow 的所有 Node 类型（BranchingNode、MapNode 等）？
2. **MCP Tool 映射**：如何将 Routa 的 MCP Tools 映射到 OpenSpec 的 Tool 组件？
3. **运行时适配器**：是否需要实现 OpenSpec Runtime Adapter 使 Routa 成为 OpenSpec 的执行环境？

### 9. 参考资源

- [Oracle Agent Spec GitHub](https://github.com/oracle/agent-spec)
- [Agent Spec 技术报告](https://arxiv.org/html/2510.04173v1)
- [PyAgentSpec 文档](https://oracle.github.io/agent-spec/)
- [语言规范](https://github.com/oracle/agent-spec)
