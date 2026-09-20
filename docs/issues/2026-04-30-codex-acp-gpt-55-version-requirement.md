---
title: "codex-acp rejects gpt-5.5 because installed Codex is too old"
date: "2026-04-30"
kind: issue
status: resolved
severity: medium
area: "acp"
tags:
  - codex-acp
  - codex
  - acp
  - kanban
  - external-dependency
reported_by: "phodal"
github_issue: 540
github_state: closed
github_url: "https://github.com/phodal/routa/issues/540"
---

# codex-acp rejects gpt-5.5 because installed Codex is too old

## What Happened

Auto-prompting a Kanban ACP task session failed with a generic UI-level internal error:

```text
Internal error
```

The server log showed the actual upstream failure came from `codex-acp`:

```text
[AcpProcess:Codex stderr] ERROR codex_acp::thread: Unhandled error during turn:
{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.5' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again."}}
```

Routa then surfaced the provider failure through the ACP prompt path:

```text
[kanban] Failed to auto-prompt ACP task session: Error: Internal error: acp: -32603
    at consumeAcpPromptResponse (src/core/acp/prompt-response.ts:148:13)
    at async dispatchSessionPrompt (src/core/acp/session-prompt.ts:1086:3)
    at async (src/core/kanban/agent-trigger.ts:654:5)
```

## Reproduction Context

- Trigger: Kanban auto-prompt ACP task session using Codex provider.
- Nearby request: `GET /api/clone/branches?repoPath=.../.routa/repos/phodal--routa` succeeded with `200`.
- Provider stderr: `gpt-5.5` requires a newer Codex app or CLI.

## Root Cause

This is an external adapter/runtime compatibility issue rather than a Routa routing failure.

`codex-acp` accepted the session turn but the installed Codex app/CLI was too old for the requested `gpt-5.5` model. The actionable fix is to update `@zed-industries/codex-acp` and the underlying Codex app/CLI used by that adapter.

Routa's current behavior is still worth tracking because the UI only showed a generic ACP internal error while the useful root cause stayed in provider stderr.

## Resolution

Closed as an external dependency/version tracking issue.

Recommended operator action:

```bash
npm install -g @zed-industries/codex-acp@latest
```

Also upgrade the Codex app/CLI if `codex-acp` still reports the same model compatibility error after reinstalling the adapter.

## Follow-Up

Routa may later improve provider error propagation so ACP prompt failures include the provider stderr root cause when safe to expose.
