---
title: "Feature Explorer hotspot auto retro should compile reusable friction profiles for Task-Adaptive prompts"
date: "2026-04-21"
kind: issue
status: open
severity: medium
area: "feature-explorer"
tags:
  - feature-explorer
  - task-adaptive
  - jit-context
  - retro
  - friction-profile
  - kanban
reported_by: "codex"
related_issues:
  - "docs/issues/2026-04-21-jit-context-needs-repo-root-context-discovery.md"
---

# Feature Explorer hotspot auto retro should compile reusable friction profiles for Task-Adaptive prompts

## What Happened

Current `feature-explorer` session analysis is still mainly a one-shot retrospective over a selected session.

`task-adaptive` can already extract friction signals from transcripts, but those signals are not yet persisted as reusable hotspot profiles. As a result, high-churn files and frequently revisited features still have to be rediscovered from scratch on each new task.

That means Routa can repeatedly pay the same exploration cost:

- re-reading the same hotspot files
- re-running the same discovery commands
- re-encountering the same path-resolution or file-selection mistakes
- re-deriving the same local failure patterns from raw session history

## Expected Behavior

When a file or feature becomes a hotspot, `Feature Explorer` should automatically queue an asynchronous retro pass that compiles a structured `friction profile`, not just another natural-language analysis artifact.

`task-adaptive` should then be able to inject that profile when the current task targets the same file or feature, so prompt assembly can start from durable prior friction memory instead of raw transcript replay.

The intended retrieval order is:

1. use file-level `friction profile` when the target file is known
2. fall back to feature-level `friction profile` when only the feature surface is known
3. fall back to broader history-session analysis only when no reusable profile is available

## Why This Might Happen

- session-analysis output is not yet persisted as a structured, matchable object
- there is no long-lived friction-memory model aggregated by `workspace + repo + file/feature`
- there is no background mechanism to queue retro generation or refresh for hotspots
- current `task-adaptive` assembly still leans on per-request transcript interpretation rather than durable hotspot memory

## Proposed Direction

- add workspace-level settings to control hotspot auto-retro enablement and thresholds
- only enqueue asynchronous retro jobs for hotspot targets instead of all touched files/features
- persist both file-level and feature-level `friction profile` records
- have `task-adaptive` prefer file-level profiles first, then fall back to feature-level profiles
- treat the profile as structured memory for prompt/runtime assembly, not only as a human-readable report

## Relevant Files

- `src/app/workspace/[workspaceId]/feature-explorer/session-analysis.ts`
- `src/app/workspace/[workspaceId]/feature-explorer/feature-explorer-page-client.tsx`
- `src/core/harness/task-adaptive.ts`
- `src/core/store/background-task-store.ts`

## References

- Local related issue: `docs/issues/2026-04-21-jit-context-needs-repo-root-context-discovery.md`

## Issue Hygiene

- 2026-04-28: reviewed as still active. Reusable friction profile storage, refresh, and task-adaptive consumption exist, but the automatic async hotspot retro queue described here is not confirmed as implemented.
