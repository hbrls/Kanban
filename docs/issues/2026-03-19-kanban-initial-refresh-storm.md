---
title: "Kanban page triggers an initial refresh storm on first open"
date: "2026-03-19"
status: resolved
severity: high
area: "kanban"
tags: [kanban, refresh, sse, performance, ui]
reported_by: "Codex"
related_issues: [
  "docs/issues/2026-03-16-kanban-workspace-events-refresh-gap.md",
  "docs/issues/2026-03-19-kanban-card-detail-session-state-stalls.md"
]
resolution_status: "fixed locally"
---

# Kanban page triggers an initial refresh storm on first open

## What Happened

Opening `http://localhost:3000/workspace/default/kanban` could immediately trigger a burst of repeated API requests even before the user interacted with the page.

Observed request pattern from local reproduction:

1. Initial page load fetched boards, tasks, sessions, specialists, workspaces, and codebases.
2. The page then issued an immediate `PATCH /api/kanban/boards/{boardId}` even though the user had not changed any board setting.
3. That board update triggered a workspace invalidation path which refreshed Kanban data again.
4. The invalidation path also scheduled additional delayed refreshes, multiplying the number of repeated `GET /api/kanban/boards`, `GET /api/tasks`, `GET /api/sessions`, and `GET /api/workspaces/{workspaceId}/codebases` requests.

## Expected Behavior

- Opening the Kanban page should perform one bounded initial data load.
- Board settings should only be persisted when the user explicitly changes them.
- Workspace invalidation should avoid stacking multiple full refresh bursts for a single initial-load mutation.

## Reproduction Context

- Environment: local Next.js dev server
- URL: `http://localhost:3000/workspace/default/kanban`
- Trigger: open the page and wait without interacting

## Why This Happened

Three refresh paths stacked on top of each other:

1. `kanban-tab.tsx` automatically persisted `specialistLanguage` back to the board after hydration, causing an unsolicited board `PATCH`.
2. `kanban-page-client.tsx` treated Kanban invalidation as an immediate refresh plus a scheduled refresh burst.
3. The initial repository auto-sync path ended with another full-page refresh instead of a narrower codebase refresh.

## Relevant Files

- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-agent-input.ts`
- `src/client/hooks/use-kanban-events.ts`

## Resolution Notes

The local fix applied on 2026-03-19 changed the refresh behavior as follows:

1. Removed the hydration-time auto-persist of `specialistLanguage`; board persistence now happens only on explicit language change.
2. Reduced Kanban SSE invalidation handling from burst refresh behavior to a single refresh for this page path.
3. Narrowed repository auto-sync follow-up work to refresh codebases only, instead of reloading all Kanban collections again.

## Verification

- Opened `/workspace/default/kanban` after the fix in local dev.
- Confirmed the immediate board `PATCH` no longer fired on first open.
- Ran:
  - `npm run lint -- 'src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx' 'src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx'`
  - `npm run test:run -- 'src/app/workspace/[workspaceId]/kanban/__tests__/kanban-agent-input.test.ts' 'src/client/hooks/__tests__/use-kanban-events.test.tsx'`
