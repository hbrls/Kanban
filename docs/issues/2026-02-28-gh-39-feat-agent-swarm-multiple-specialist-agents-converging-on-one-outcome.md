---
title: "[GitHub #39] feat: Agent swarm — multiple specialist agents converging on one outcome"
date: "2026-02-28"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-39"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/39"]
github_issue: 39
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/39"
---

# [GitHub #39] feat: Agent swarm — multiple specialist agents converging on one outcome

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #39
- URL: https://github.com/phodal/routa/issues/39
- State: closed
- Author: phodal
- Created At: 2026-02-28T12:10:29Z
- Updated At: 2026-02-28T12:10:29Z

## Labels

- (none)

## Original GitHub Body

## Background

From [background-agents.com](https://background-agents.com/): Many agents, one outcome. Every agent works on a different facet, and results converge into a single deliverable.

## Motivation

Routa already has an orchestrator that can delegate to specialist agents (see `src/core/orchestration/`). However, specialists currently run sequentially within one session. There is no mechanism to run multiple independent specialist agents in parallel and then merge their results.

## Proposed Solution

Extend the Orchestrator to support a swarm execution mode:

- **Swarm plan**: the orchestrator analyses the task and decomposes it into parallel sub-tasks, each assigned to a specialist
- **Parallel ACP sessions**: each sub-task gets its own ACP session running concurrently
- **Result aggregation**: once all specialists complete (or timeout), a synthesis agent merges outputs into a final result
- **Progress events**: stream per-specialist status through the existing event bridge

### Example swarm decomposition

Task: "Migrate authentication from JWT to Paseto"
- Specialist A: update auth library in `src/auth`
- Specialist B: update middleware and guards
- Specialist C: update tests
- Specialist D: update documentation
- Synthesizer: review diffs and create a single PR from all branches

## References

- https://background-agents.com/ (Agent swarms section)
- Existing orchestration: `src/core/orchestration/orchestrator.ts`
