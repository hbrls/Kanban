---
name: evolution-architecture-review
description: Multi-agent architecture evolvability review for this repository. Use when the user wants to analyze current architecture quality, evolvability, fitness functions, coupling, boundary clarity, delivery flow, or phased evolution strategy. Designed to be invoked from Claude Code with prompts like `/evolution-architecture-review analyze the current architecture evolvability`.
license: MIT
---

## Goal

Assess how safely this codebase can evolve, using parallel analysis where possible.

Do not give generic architecture advice. Ground every conclusion in repository evidence.

Default to read-only analysis. Do not edit code unless the user explicitly changes the task from review to implementation.

## Default Mode

Prefer a 4-lens review in parallel. If subagents or `Task` are available, use them. If not, run the same lenses sequentially yourself.

### Lens 1: System shape and boundaries
- Identify major modules, ownership boundaries, and dependency direction.
- Look for hidden coupling, duplicated semantics, and unclear seams.

### Lens 2: Runtime flow and operability
- Inspect task flow, orchestration, state transitions, control-plane behavior, and failure visibility.
- Focus on whether the system is observable and debuggable during change.

### Lens 3: Fitness and verification
- Inspect hard gates, tests, contract checks, parity checks, and evidence loops.
- Determine whether the architecture has executable constraints or mostly human judgment.

### Lens 4: Evolution path
- Propose incremental change steps, rollback-friendly sequencing, and smallest viable improvements.
- Avoid rewrite-first recommendations.

## Starting Points

Read these first unless the user narrows scope:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/product-specs/FEATURE_TREE.md`
- `docs/fitness/README.md`
- `docs/blog/routa-kanban-agent-team-management.md`
- `docs/blog/harness-fitness-function.md`
- `src/core/orchestration/`
- `src/core/kanban/`
- `src/core/specialists/`
- `crates/routa-core/src/workflow/`
- `crates/routa-server/src/`

Then expand only where evidence requires it.

## Scope Hygiene

Treat the main repository tree as authoritative. Unless the user explicitly asks otherwise, ignore duplicate or generated trees such as:

- `.worktrees/`
- `.routa/repos/`
- `node_modules/`
- `.next/`
- `target/`
- `out/`
- `dist/`
- `coverage/`
- `tmp/`
- `test-results/`

When using `Glob`, `Grep`, or `Task`, state these exclusions explicitly so subagents do not waste time or cite mirrored files.

## Workflow

1. Restate the requested architecture scope in one sentence.
2. Gather repository evidence before judging.
3. Establish path exclusions before broad searches.
4. Run the 4 review lenses in parallel if possible.
5. Merge overlapping findings and remove weak claims.
6. De-duplicate mirrored file references and prefer canonical paths.
7. Produce a final report with measurable evolution advice.

## Required Output

Use this structure:

```markdown
# Architecture Evolvability Review

## Scope

## Current Architecture Snapshot
- Facts

## Strengths
- ...

## Evolvability Risks
- Severity: High/Medium/Low
- Evidence: file paths, modules, flows, or checks
- Why it slows or endangers evolution

## Fitness Function Gaps
- Missing or weak executable constraints
- Suggested hard gates or warning checks

## Recommended Evolution Path
1. ...
2. ...
3. ...

## Quick Wins
- Small, low-risk improvements

## Open Questions
- ...
```

## Hard Rules

1. Cite concrete files, modules, workflows, or checks for every substantive claim.
2. Prefer evidence from current code over aspirational docs when they conflict.
3. Distinguish facts, inferences, and recommendations.
4. Recommend phased evolution, not aesthetic rewrites.
5. Call out where architecture already has strong fitness discipline.
6. Suggest fitness functions in executable terms whenever possible.
7. Prefer canonical file paths from the main working tree. Do not cite mirrored or generated paths unless necessary.

## Example Invocation

```bash
claude -p "/evolution-architecture-review Analyze the current architecture evolvability of this repository."
```
