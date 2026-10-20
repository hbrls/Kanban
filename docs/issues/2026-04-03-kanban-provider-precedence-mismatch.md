---
title: "Kanban provider precedence diverges between settings, tab selection, and session creation"
date: "2026-04-03"
status: resolved
resolved_at: "2026-04-03"
severity: high
area: "kanban"
tags: [kanban, provider, acp, session, automation, settings, ui]
reported_by: "Codex"
related_issues: [
  "docs/issues/2026-03-19-kanban-hidden-provider-failures.md",
  "docs/issues/2026-03-14-kanban-story-lane-automation-stalls-after-first-session.md"
]
---

# Kanban provider precedence diverges between settings, tab selection, and session creation

## What Happened

Kanban exposed multiple provider surfaces with inconsistent precedence:

1. Lane automation in `Kanban Settings` could leave `providerId` empty, which the UI described as `Auto`.
2. The Kanban tab let the user pick a provider in the ACP input bar.
3. Card detail reruns and session creation could still resolve to a different provider, often `opencode`, because the selected tab provider was only stored in client-local ACP state.

This produced a misleading flow:

1. A user selected `codex` in the Kanban tab.
2. A lane or card detail view implied the next run would use that provider.
3. The actual card session was created without an explicit provider override.
4. The server fell back to lane defaults, specialist defaults, or `opencode`.
5. The resulting session provider no longer matched the visible Kanban selection.

## Expected Behavior

Provider resolution should follow one stable model:

1. Card override has the highest precedence.
2. If the card has no override, the lane's explicit provider from `Kanban Settings` wins.
3. If the lane is configured as `Auto`, the board's current Kanban-tab provider wins.
4. Once a session is created, its provider is immutable and UI should display that frozen value.
5. Changing provider in the Kanban session/input area affects future runs and reruns, not the already-created session.

## Reproduction Context

- Environment: web Kanban at `localhost:3000`
- Trigger: open a card detail, select or observe a provider in the Kanban tab, rerun a card or let backlog automation create a session

## Why This Happened

- `useAcp` persisted the current provider only in browser local storage.
- Server-side Kanban automation could not read that client-only selection.
- `resolveKanbanAutomationStep(...)` treated missing lane provider configuration as `specialist.defaultProvider`, which conflicted with the UI copy that described the same state as `Auto`.
- New card creation, issue import, reruns, and session displays did not all resolve provider through the same helper or metadata source.

## Relevant Files

- `src/core/kanban/effective-task-automation.ts`
- `src/core/kanban/board-auto-provider.ts`
- `src/core/kanban/workflow-orchestrator-singleton.ts`
- `src/app/api/kanban/boards/route.ts`
- `src/app/api/kanban/boards/[boardId]/route.ts`
- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-tab-panels.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-card-activity.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-settings-modal.tsx`
- `crates/routa-server/src/api/kanban.rs`

## Resolution

This issue is resolved in the current codebase.

The fix unified provider handling around a board-scoped auto provider:

- Added persisted board metadata `kanbanAutoProvider:<boardId>` and surfaced it as `autoProviderId` in both Next.js and Rust Kanban APIs.
- Updated Kanban automation resolution so missing lane `providerId` means `Auto`, not an implicit specialist provider, with a shared precedence model:
  card override -> explicit lane provider -> board auto provider -> specialist default -> runtime fallback.
- Persisted the board auto provider before create/import/move/rerun operations when the Kanban tab selection is the active source of truth.
- Updated Kanban Settings, lane summaries, card detail, empty session panes, and session headers to display the same resolved provider chain.
- Stopped silently converting manual card creation/import into card-level provider overrides.

## Verification

- `npx vitest run 'src/core/kanban/__tests__/board-auto-provider.test.ts' 'src/core/kanban/__tests__/effective-task-automation.test.ts' 'src/app/api/kanban/boards/__tests__/route.test.ts' 'src/app/workspace/[workspaceId]/kanban/__tests__/kanban-settings-modal.test.tsx' 'src/app/workspace/[workspaceId]/kanban/__tests__/kanban-tab.test.tsx'`
- `npx vitest run 'src/core/kanban/__tests__/workflow-orchestrator-singleton.test.ts' 'src/app/api/tasks/[taskId]/__tests__/route.test.ts'`
- `npx vitest run 'src/app/workspace/[workspaceId]/kanban/__tests__/kanban-tab-detail-and-prompts.test.tsx'`
- `npx eslint ...` on the touched TypeScript files
- `cargo fmt --all`
- `cargo test -p routa-server api::kanban::tests::translates_workspace_updated_kanban_event -- --exact`
