---
title: "[GitHub #85] [Readability] Agent-First Knowledge Architecture: Repository as System of Record"
date: "2026-03-08"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-85", "enhancement", "agent"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/85"]
github_issue: 85
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/85"
---

# [GitHub #85] [Readability] Agent-First Knowledge Architecture: Repository as System of Record

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #85
- URL: https://github.com/phodal/routa/issues/85
- State: closed
- Author: phodal
- Created At: 2026-03-08T06:43:27Z
- Updated At: 2026-03-13T14:03:50Z

## Labels

- `enhancement`
- `Agent`

## Original GitHub Body

## Background

Inspired by OpenAI's article ["Harness Engineering: Codex in an Agent-First World"](https://openai.com/index/harness-engineering/) (2026-02-11), which describes their experience building software products **entirely with AI agents** over 5 months.

## Key Insights from OpenAI

### 1. Repository as System of Record

> 我们不再将 AGENTS.md 视为百科全书，而是将其视为**目录**。代码仓库的知识库位于一个结构化的 `docs/` 目录中，此目录被当作**记录系统**来使用。

OpenAI's `docs/` structure:
```
docs/
├── design-docs/       # 设计文档（带验证状态）
│   ├── index.md
│   └── core-beliefs.md
├── exec-plans/        # 执行计划
│   ├── active/
│   ├── completed/
│   └── tech-debt-tracker.md
├── generated/         # 自动生成的文档
├── product-specs/     # 产品规格
├── references/        # 外部参考（LLM-friendly）
├── ARCHITECTURE.md
├── QUALITY_SCORE.md   # 质量评分
└── RELIABILITY.md
```

**Routa Gap**: Our `docs/` only has `blog/`, `issues/`, `copilot-fs-base-agent/`. Design docs are scattered in `.kiro/specs/`.

### 2. Entropy & Garbage Collection

> 技术债务就像一笔高息贷款：不断地以小额贷款的方式偿还债务，总比让债务不断累积，再痛苦地一次解决要好得多。

OpenAI's approach:
- Encode **Golden Rules** directly into the repository
- Run **periodic cleanup processes** (like garbage collection)
- Run **doc-gardening agent** to scan stale docs and create fix PRs

**Routa Gap**: We just created `issue-garbage-collector` SKILL, but lack:
- Code-level Golden Rules
- Automated doc-gardening agent
- Quality scoring system

### 3. Agent Readability First

> 从智能体的角度来看，它在运行时无法在情境中访问的任何内容都是**不存在的**。存储在 Google Docs、聊天记录或人们头脑中的知识都无法被系统访问。

OpenAI's approach:
- Optimize for Codex readability, not human readability
- Choose "boring" technologies (stable APIs, well-represented in training data)
- Create LLM-friendly reference docs (e.g., `references/uv-llms.txt`)

**Routa Gap**:
- Mixed Chinese/English docs (LLM-unfriendly)
- Architecture knowledge scattered
- No LLM-friendly reference docs

### 4. Canonical Architecture & Taste

> 通过强制执行不变量，而非对实施过程进行微观管理，我们令智能体能够快速交付，而且不会削弱基础。

OpenAI's approach:
- Strict architecture model with fixed layers per domain
- **Custom linters** enforce rules mechanically
- Error messages include fix instructions (injected into agent context)

**Routa Gap**:
- We have Specialist roles (ROUTA, CRAFTER, GATE, DEVELOPER)
- We have `resources/specialists/` and `resources/flows/`
- But lack: automated architecture validation, custom linters, structure tests

### 5. Increasing Autonomy Levels

> 给定一个提示，智能体现在可以：验证代码库状态 → 重现漏洞 → 录制视频 → 实施修复 → 验证修复 → 录制第二个视频 → 开 PR → 响应反馈 → 合并

**Routa Gap**: We have `pr-verify` and `dogfood` SKILLs, but lack complete end-to-end automation.

---

## Proposed Implementation

### Phase 1: Feedback-Driven Issue Management ✅ (PR #86)

- [x] Restructure Issue Management in AGENTS.md as 5-step feedback loop
- [x] Create `issue-garbage-collector` SKILL
- [x] Update paths from `issues/` to `docs/issues/`

### Phase 2: Repository as System of Record 🚧

- [x] Create `docs/ARCHITECTURE.md`
- [ ] Create `docs/design-docs/index.md` — Index of all design documents
- [ ] Create `docs/design-docs/core-beliefs.md` — Agent-first operating principles
- [ ] Migrate `.kiro/specs/` content to `docs/design-docs/`
- [ ] Create `docs/exec-plans/` structure (active, completed, tech-debt-tracker)
- [ ] Create `docs/references/` with LLM-friendly docs (tauri-llms.txt, drizzle-llms.txt, acp-llms.txt)

### Phase 3: Quality Scoring System ❌

- [ ] Create `docs/QUALITY_SCORE.md` — Per-area quality grades
- [ ] Define quality dimensions (test coverage, doc freshness, architecture compliance)
- [ ] Create `quality-scorer` SKILL to auto-update scores

### Phase 4: Doc-Gardening Automation ✅

- [x] Create `issue-garbage-collector` SKILL — Scan stale issues, create fix PRs
- [x] `.github/workflows/issue-garbage-collector.yml`

### Phase 5: Architecture Enforcement ✅

- [x] Specialist roles defined (ROUTA, CRAFTER, GATE, DEVELOPER) in `resources/specialists/`
- [x] Flow definitions in `resources/flows/`
- [x] ESLint 9 flat config with TypeScript-ESLint + React Hooks + Next.js

### Phase 6: Golden Rules Codification ❌

- [ ] Document "Golden Rules" in `docs/design-docs/golden-rules.md`
- [ ] Encode rules as linter configs where possible
- [ ] Create periodic cleanup workflow

---

## Success Criteria

1. **AGENTS.md stays ~100 lines** — Acts as TOC, not encyclopedia
2. **All knowledge in `docs/`** — Single source of truth
3. **Automated maintenance** — Doc-gardening, issue GC, quality scoring
4. **Architecture enforced** — Custom linters, structure tests
5. **Agent-readable** — LLM-friendly reference docs

## References

- [OpenAI: Harness Engineering](https://openai.com/index/harness-engineering/)
- [Routa: Agent Team Design Practice](docs/blog/agent-team-design-practice.md)
- [Routa: From AutoDev to Routa](docs/blog/from-autodev-to-routa.md)
- PR #86: Phase 1 implementation
