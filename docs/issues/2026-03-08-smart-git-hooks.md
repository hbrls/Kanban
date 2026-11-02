---
title: Smart Git Hooks with AI-Aware Error Handling
issue: 87
date: "2026-03-08"
status: resolved
severity: medium
area: dx
tags: [git-hooks, husky, automation, ai-agent]
reported_by: phodal
resolved_by: Augment Agent
resolved_at: "2026-03-08"
---

## Problem

需要在 pre-push 时执行 lint 和测试，如果失败：
- 在 AI agent 环境中 → 输出明确的错误信息，告诉 AI 必须修复
- 在人工环境中 → 自动启动 `claude -p` 来修复问题

## Solution

### 1. Husky Git Hooks (自动安装)

| Hook | Action | On Failure |
|------|--------|------------|
| `pre-commit` | Run `npm run lint` | Block commit |
| `pre-push` | Run lint + typecheck + tests | AI-aware handling |

### 2. Smart Check Script (`scripts/smart-check.sh`)

**AI Agent 检测** (通过环境变量):
- `CLAUDE_CODE`, `ANTHROPIC_AGENT`, `AUGMENT_AGENT`
- `CURSOR_AGENT`, `ROUTA_AGENT`, `AIDER_AGENT`
- `COPILOT_AGENT`, `WINDSURF_AGENT`, `CLINE_AGENT`
- `CI`, `GITHUB_ACTIONS`
- `CLAUDE_CONFIG_DIR`, `MCP_SERVER_NAME`

**失败处理**:
- **AI Agent 环境**: 输出结构化错误信息，明确告诉 AI 必须修复
- **人工环境**: 询问是否用 `claude -p` 自动修复

### 3. 实时日志输出

使用 `tee` 同时显示实时输出并捕获结果。

## Relevant Files

- `.husky/pre-commit` - 提交前 lint 检查
- `.husky/pre-push` - 推送前完整检查
- `scripts/smart-check.sh` - 智能检查脚本
- `AGENTS.md` - 文档更新

## Emergency Bypass

```bash
SKIP_HOOKS=1 git commit -m "emergency"
SKIP_HOOKS=1 git push
```

## Related Issues

- #85 (Agent-First Knowledge Architecture)

