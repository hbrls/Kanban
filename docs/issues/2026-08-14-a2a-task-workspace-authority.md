---
title: "A2A task operations must be bound to server-side workspace authority"
date: "2026-08-14"
kind: issue
status: resolved
severity: high
area: a2a
tags: [a2a, security, workspace, authorization, multi-tenant]
reported_by: "GitHub issue reporter"
related_issues: []
github_issue: 581
github_state: closed
github_url: "https://github.com/phodal/routa/issues/581"
resolved_at: "2026-08-14"
---

# A2A task operations must be bound to server-side workspace authority

## What Happened

The process-global Next.js A2A task bridge allowed unfiltered listing and
task-id-only reads or cancellation. The Rust mirror also accepted workspace
selection from request metadata and loaded tasks by bare ID.

## Resolution

Both backends now derive A2A workspace authority from an existing server-side
ACP session. `sessionId` or `A2A-Session-Id` selects that session but cannot
override its stored workspace. Task list, get, subscribe, update, and cancel
operations are scoped before returning or mutating data; cross-workspace task
IDs return the same not-found result as missing tasks.

The JavaScript SDK was upgraded from the v0.3 line to `@a2a-js/sdk` 1.0.1.
Routa keeps its current v0.3 AgentCard wire contract explicitly while using
the v1 SDK's staged compatibility path, so the dependency upgrade does not
misrepresent the still-legacy protocol surface as native v1.

## Verification

- Next.js Alice/Bob bridge and request-authority tests
- Rust Alice/Bob session authority, list, get, and cancel tests
- TypeScript typecheck and focused A2A suite
- Rust A2A HTTP contract test
- `api-contract.yaml` documents the session authority inputs and error states

## References

- https://github.com/phodal/routa/issues/581
- https://github.com/a2aproject/a2a-js/blob/main/docs/migration-guide.md
