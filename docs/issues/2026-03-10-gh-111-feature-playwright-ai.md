---
title: "[GitHub #111] [Feature] Playwright 页面快照机制 - AI 辅助测试上下文"
date: "2026-03-10"
status: resolved
severity: medium
area: "frontend"
tags: ["github", "github-sync", "gh-111", "enhancement", "feature", "area-frontend", "complexity-medium", "testing", "ai-assist"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/111"]
github_issue: 111
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/111"
---

# [GitHub #111] [Feature] Playwright 页面快照机制 - AI 辅助测试上下文

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #111
- URL: https://github.com/phodal/routa/issues/111
- State: closed
- Author: phodal
- Created At: 2026-03-10T14:16:03Z
- Updated At: 2026-03-10T14:43:26Z

## Labels

- `enhancement`
- `feature`
- `area:frontend`
- `complexity:medium`
- `testing`
- `ai-assist`

## Original GitHub Body

## 概述

为 Routa.js 项目建立自动化的页面快照机制，使用 playwright-cli 为每个关键页面生成结构化快照（YAML 格式）。这些快照将作为 AI 辅助测试的上下文信息，帮助 AI 更好地理解页面结构、定位元素、生成测试用例和调试问题。

## 可行性分析

### ✅ 实现可行性：高

**现有基础设施：**
- `playwright-cli` 已集成，支持 `snapshot --filename=xxx.yaml` 命令
- `.playwright-cli/` 目录已有 YAML 格式快照示例
- 33+ e2e 测试文件，Playwright 配置完整
- 清晰的 Next.js App Router 页面结构 (`src/app/`)
- `@playwright/test@^1.58.2` 已安装

**技术风险评估：低**
- 所有核心依赖已存在
- 无需引入新技术栈

### Gap Analysis ⚠️

1. **playwright-cli not installed**: Not in global PATH or local node_modules
2. **No Page Registry**: No centralized configuration for snapshot targets
3. **No Snapshot Generator**: No automation script for batch snapshot generation
4. **No AI Integration**: No API for AI agents to query snapshot data

## 💡 存储策略：Co-located with page.tsx

快照文件应该**直接存储在代码库中，与 `page.tsx` 同目录**，作为页面的测试上下文存在，方便 AI Agent 调试时直接读取当前页面的 DOM 结构和元素引用。

> 这与 `AGENTS.md` 中的测试策略一致："Use **Playwright MCP tool** or CLI (`playwright-cli`) or Skills to test the web UI directly" — 快照文件作为 Playwright 测试的 co-located context，让 AI Agent 在调试时能即时获取页面结构。

### 存储结构

```
src/app/
├── page.tsx
├── page.snapshot.yaml          # 首页快照
├── workspace/
│   └── [workspaceId]/
│       ├── page.tsx
│       ├── page.snapshot.yaml  # workspace 详情快照
│       └── kanban/
│           ├── page.tsx
│           └── page.snapshot.yaml
├── mcp-tools/
│   ├── page.tsx
│   └── page.snapshot.yaml
├── traces/
│   ├── page.tsx
│   └── page.snapshot.yaml
└── settings/
    ├── page.tsx
    └── page.snapshot.yaml
```

### 优势

1. **调试友好** - AI Agent 调试某页面时，快照就在同目录，无需跳转查找
2. **版本同步** - 页面代码和快照一起 commit，保持一致性
3. **上下文清晰** - 每个 `page.snapshot.yaml` 只包含当前页面的结构
4. **符合 colocation 原则** - Next.js App Router 推荐的文件组织方式

## 关键页面

| 页面 | 路径 | 文件位置 | 优先级 |
|------|------|----------|--------|
| 首页 | `/` | `src/app/page.tsx` | P0 |
| Workspace 详情 | `/workspace/[id]` | `src/app/workspace/[workspaceId]/page.tsx` | P0 |
| Kanban 看板 | `/workspace/[id]/kanban` | `src/app/workspace/[workspaceId]/kanban/page.tsx` | P0 |
| MCP Tools | `/mcp-tools` | `src/app/mcp-tools/page.tsx` | P1 |
| Traces | `/traces` | `src/app/traces/page.tsx` | P1 |
| Settings | `/settings` | `src/app/settings/page.tsx` | P2 |
| A2A Protocol | `/a2a` | `src/app/a2a/page.tsx` | P2 |
| AG-UI | `/ag-ui` | `src/app/ag-ui/page.tsx` | P2 |

## 实现方案

### 推荐：playwright-cli Integration Wrapper

**理由**：
1. **Skill alignment**: 项目已有 playwright-cli skill (`.claude/skills/playwright-cli/SKILL.md`)
2. **Format consistency**: `.playwright-cli/` 中的快照已是所需的 YAML 格式
3. **Fastest implementation**: Wrapper 脚本比重新实现快照逻辑更简单
4. **AI agent compatibility**: 快照格式与 AI agents 已使用的一致

### 实现策略

1. 添加 `playwright-cli` 作为可选 devDependency
2. 创建 `scripts/generate-snapshots.mjs`：
   - 读取页面注册表
   - 启动 dev server（如未运行）
   - 使用 playwright-cli 生成快照
   - 保存到对应的 `page.snapshot.yaml`
3. 添加 npm scripts: `snapshots:generate`, `snapshots:validate`

### 实现文件

| 文件 | 用途 |
|------|---------|
| `scripts/generate-snapshots.mjs` | 主快照生成脚本 |
| `scripts/validate-snapshots.mjs` | 快照验证工具 |
| `src/app/**/page.snapshot.yaml` | Co-located 快照文件 |

## 核心需求

### 1. 页面快照自动生成
- 使用 playwright-cli 生成 YAML 格式快照
- 存储为 `page.snapshot.yaml`，与 `page.tsx` 同目录
- 包含 DOM 结构、元素引用 (e1, e2...)、页面 URL/标题

### 2. CLI 工具支持
- `npm run snapshots:generate` - 生成所有快照
- `npm run snapshots:generate -- --page=workspace` - 生成指定页面
- `npm run snapshots:validate` - 验证快照一致性

### 3. AI 测试上下文集成
- 快照文件可被 AI agent 直接读取（co-located）
- 调试时自动发现当前页面的 snapshot

## 快照文件格式 (示例)

```yaml
# src/app/page.snapshot.yaml
# 由 playwright-cli snapshot 生成
metadata:
  url: http://localhost:3000/
  title: Routa
  generated_at: 2026-03-10T12:35:42Z
  playwright_version: "1.40.0"

snapshot:
  - generic [active] [ref=e1]:
    - banner [ref=e3]:
      - link "Routa" [ref=e4]
      - button "Agents" [ref=e29]
    # ...
```

## 预估工作量

| 模块 | 估时 |
|------|------|
| playwright-cli setup | 0.5 天 |
| Snapshot Generator 脚本 | 1 天 |
| CLI 命令集成 | 0.5 天 |
| Validation 脚本 | 0.5 天 |
| 测试 | 0.5 天 |
| **总计** | **2-3 天** |

## 参考资料

- 需求文档: `.kiro/specs/playwright-page-snapshots/requirements.md`
- playwright-cli Skill: `.claude/skills/playwright-cli/SKILL.md`
- 现有快照示例: `.playwright-cli/*.yml`
- 测试策略: `AGENTS.md` (Testing & Debugging)
- [Playwright Test CLI](https://playwright.dev/docs/test-cli)
- [Test generator | Playwright](https://playwright.dev/docs/codegen)

## 后续扩展

- [ ] 快照差异检测 (CI 中自动验证)
- [ ] 快照元数据增强 (页面流程、交互模式)
- [ ] AI 测试生成器集成
