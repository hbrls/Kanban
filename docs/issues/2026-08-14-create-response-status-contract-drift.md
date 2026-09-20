---
title: "Create response statuses drift between OpenAPI and runtime backends"
date: "2026-08-14"
kind: issue
status: resolved
severity: medium
area: api-contract
tags: [openapi, contract, nextjs, rust, status-code]
reported_by: "GitHub issue reporter"
related_issues: []
github_issue: 577
github_state: closed
github_url: "https://github.com/phodal/routa/issues/577"
resolved_at: "2026-08-14"
---

# Create response statuses drift between OpenAPI and runtime backends

## What Happened

The Next.js create-agent, create-note, and create-workspace handlers return
HTTP `201`, while `api-contract.yaml` declares only `200`. The Rust mirrors
return `200`, so broad contract-test assertions accept either status and then
validate the response body against the wrong OpenAPI bucket.

## Expected Behavior

Both backends should return the status declared for the operation. Agent and
workspace creation should return `201`; note creation should return `201` and
an update of an existing note should return `200`.

## Reproduction Context

- Environment: both
- Trigger: compare POST handler responses with the response buckets for
  `createAgent`, `createOrUpdateNote`, and `createWorkspace`

## Why This Might Happen

- The Next.js handlers adopted create-specific status codes after the contract
  and Rust routes were written.
- Contract tests allowed `200` or `201`, masking backend and schema drift.
- Operation-response validation treated an undeclared status as schema-free
  success.

## Relevant Files

- `api-contract.yaml`
- `src/app/api/agents/route.ts`
- `src/app/api/notes/route.ts`
- `src/app/api/workspaces/route.ts`
- `crates/routa-server/src/api/agents.rs`
- `crates/routa-server/src/api/notes.rs`
- `crates/routa-server/src/api/workspaces.rs`
- `tests/api-contract/schema-validator.ts`

## References

- https://github.com/phodal/routa/issues/577

## Resolution

OpenAPI now declares `201` for agent and workspace creation, and declares both
`201` create and `200` update responses for the note upsert operation. The Rust
handlers match those statuses, contract tests assert exact status codes, and
operation-response validation rejects undeclared response buckets instead of
treating them as schema-free success.
