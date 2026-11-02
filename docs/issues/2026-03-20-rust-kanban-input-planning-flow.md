---
title: "Rust Desktop Kanban Input Planning Flow"
date: 2026-03-20
agent: Codex (GPT-5)
status: resolved
severity: medium
area: kanban
component: rust-kanban
---

# Rust Desktop Kanban Input Planning Flow

## Problem

The Rust desktop Kanban input box could create an ACP session for OpenCode, but submitting a planning prompt did not reliably create backlog cards in the active workspace.

## What Happened

- The Kanban input box created an OpenCode session with `toolMode=full` and `mcpProfile=kanban-planning`.
- Rust `/api/mcp` ignored `wsId` and `mcpProfile` from the MCP URL.
- `tools/list` returned the full tool surface instead of the Kanban planning subset.
- `tools/call` did not inherit the current workspace when the agent omitted `workspaceId`.
- As a result, sessions were created and prompts were sent, but the planning flow did not consistently write backlog cards to the intended board.

## Why It Matters

- The top Kanban input is the primary backlog-planning entry point in the Rust desktop app.
- If it cannot reliably create cards in the current workspace, the desktop automation story is incomplete even when lane automation itself works.

## Fix

- Updated `crates/routa-server/src/api/mcp_routes.rs` to persist MCP session scope from query parameters.
- `initialize` now captures `wsId` and `mcpProfile` in the Rust MCP session state.
- `tools/list` now filters to the Kanban planning allowlist when `mcpProfile=kanban-planning`.
- `tools/call` now injects the current workspace into tool arguments and rejects tools outside the allowed profile.

## Verification

### Input Replay

1. Run the desktop Rust server:
   - `cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example standalone_server`
2. Open:
   - `http://127.0.0.1:3210/workspace/rust-fix-enabled-1773965081/kanban`
3. Ensure `KanbanTask Agent provider` is `OpenCode`.
4. Submit a unique prompt in the top input:
   - `create a js hello world 1773966400`
5. Wait for the ACP session to start and the board to refresh.

### Expected Evidence

- Rust logs show:
  - `session/prompt`
  - `tools/call`
- `GET /api/tasks?workspaceId=rust-fix-enabled-1773965081` returns a new backlog card:
  - `title = "js hello world 1773966400"`
  - `columnId = "backlog"`
- Browser output shows:
  - `Kanban Board(3 tasks)`
  - `Backlog 2 cards`
  - `js hello world 1773966400`

## Outcome

The Rust desktop Kanban input flow now works as intended for backlog planning:

- `Kanban input -> OpenCode session -> kanban-planning MCP tools -> create_card -> backlog card`

This entry point is intentionally backlog-only. It creates planning cards and stops there; it does not directly execute implementation work.

## Follow-up Verification: Full Auto Chain

The same Rust desktop setup was later used to verify a longer chain:

- `input -> backlog -> todo -> dev`

### Replay Workspace

- Workspace:
  - `rust-auto-chain-import-1773967200`
- Board:
  - `imported-auto-chain-board`
- Lane automation:
  - `todo -> OpenCode / CRAFTER / entry`
  - `dev -> OpenCode / CRAFTER / entry`

### Replay Steps

1. Import a board config into Rust settings.
2. Update the imported board so it has six columns and automation on both `todo` and `dev`.
3. Open:
   - `http://localhost:3210/workspace/rust-auto-chain-import-1773967200/kanban`
4. Submit a unique top-input prompt:
   - `auto chain browser 1773967200`
5. Confirm the new card lands in `Backlog`.
6. Move the same task to `todo`.
7. Move the same task again to `dev`.

### Expected Evidence

- The input creates a backlog card:
  - `title = "auto chain browser 1773967200"`
  - `columnId = "backlog"`
- Entering `todo` creates a new automation session and updates:
  - `assignedProvider = "opencode"`
  - `assignedRole = "CRAFTER"`
  - `triggerSessionId = <todo-session>`
- Entering `dev` creates another fresh automation session even though the task already had a previous `triggerSessionId`.

### Why This Matters

- It closes the remaining gap between backlog planning and multi-lane Rust execution.
- It verifies that an older lane session does not suppress later automated transitions for the same task.
