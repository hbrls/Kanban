---
title: "Tauri Kanban Static Routing Regression"
date: 2026-03-19
agent: Codex (GPT-5)
status: resolved
severity: high
area: desktop
component: tauri-frontend
---

# Tauri Kanban Static Routing Regression

## Problem

After removing the desktop-specific home UI and rebuilding the static frontend used by Tauri, the desktop flow can still load the unified homepage, but navigating from the homepage to `/workspace/{workspaceId}/kanban` does not successfully render the Kanban page.

## What Happened

- `npm run build:static` succeeded and generated the expected placeholder routes for workspace pages.
- `npm run tauri:build` succeeded and produced a `.app` bundle and `.dmg`.
- The desktop homepage loaded correctly from the Rust static server on `http://127.0.0.1:3210/`.
- The homepage CTA generated a valid `Open Kanban` href such as `/workspace/{workspaceId}/kanban`.
- Opening `/workspace/default/kanban` from the desktop static server did not reach a usable Kanban board.

## Current Symptoms

- Before the first fallback fix, `/workspace/{id}/kanban` rendered the workspace overview page instead of the standalone Kanban page.
- After adding an explicit `/workspace/{id}/kanban -> workspace/__placeholder__/kanban.*` mapping in the Rust fallback, the route no longer renders the workspace overview, but now fails with a client-side application error.
- Browser output shows:
  - `Application error: a client-side exception has occurred while loading 127.0.0.1`
- `traces` still loads in the desktop static server, which suggests the regression is specific to workspace deep-link static routing rather than a total frontend boot failure.

## Why It Matters

- The desktop build currently cannot rely on the homepage launcher to enter the primary Kanban surface.
- The product intent says Kanban is the main execution surface, so this blocks the desktop path that the homepage is supposed to funnel users into.
- The regression is easy to miss because the build succeeds and the homepage itself looks correct.

## Evidence

- Static export includes:
  - `workspace/__placeholder__.html`
  - `workspace/__placeholder__/kanban.html`
  - `workspace/__placeholder__/kanban.txt`
  - nested RSC payload files under `workspace/__placeholder__/kanban/`
- Existing Playwright check results:
  - Homepage loads: pass
  - `Open Kanban` href generation: pass
  - Homepage -> Kanban flow: fail on missing visible Kanban content / application error
- Rust fallback logic under investigation:
  - `crates/routa-server/src/lib.rs`

## Related Files

- `src/app/page.tsx`
- `crates/routa-server/src/lib.rs`
- `apps/desktop/src-tauri/frontend/workspace/__placeholder__/kanban.html`
- `apps/desktop/src-tauri/frontend/workspace/__placeholder__/kanban.txt`

## Resolution

The regression had two separate causes:

- The Rust static fallback served the correct placeholder files for `/workspace/{id}/kanban`, but the exported payload still contained `__placeholder__` route values, so the desktop deep-link path was inconsistent with the actual URL.
- The Rust `/api/kanban/boards` endpoint returned board summaries with `columnCount` only, while the Kanban UI expected full boards with a `columns` array. That caused the client crash `TypeError: r.columns is not iterable` during hydration.

## Fix

- Updated `crates/routa-server/src/lib.rs` so workspace and kanban static responses rewrite `__placeholder__` to the real `workspaceId` for desktop static routing.
- Updated `crates/routa-server/src/api/kanban.rs` so `GET /api/kanban/boards` returns full board payloads by resolving each board via `kanban.getBoard` and preserving runtime metadata.
- Added a defensive `board.columns ?? []` guard in `src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx` so incomplete board payloads do not white-screen the page again.

## Verification

- `npm run build:static`
- `cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example standalone_server`
- `npx playwright test --config=playwright.tauri.config.ts e2e/homepage-open-board-tauri.spec.ts --project=chromium`

Result:

- Desktop homepage loads with the unified home UI.
- `Open Kanban` navigates to `/workspace/{id}/kanban`.
- Kanban columns render successfully in desktop static mode.

## Follow-up Verification: Kanban + OpenCode Automation Replay

This replay was used to verify that the Rust desktop backend not only opens Kanban,
but can also drive backlog planning through the KanbanTask Agent with OpenCode.

### Preconditions

- Run the desktop static server:
  - `cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example standalone_server`
- Use the desktop static URL:
  - `http://127.0.0.1:3210/workspace/default/kanban`
- Keep `Auggie` out of scope during this replay. Use `OpenCode`.

### Replay Steps

1. Open `/workspace/default/kanban` from the desktop static server.
2. Confirm the `KanbanTask Agent provider` selector is visible and `OpenCode` is selected.
3. In the `Describe work to plan in Kanban...` input, send a unique prompt such as:
   - `Create exactly one backlog card titled VERIFY-KANBAN-OPENCODE-20260320-B and stop after creation.`
4. Wait for the KanbanTask Agent session panel to open and for the board to refresh.
5. Confirm the new unique card appears in the `Backlog` column.
6. Confirm the chat/trace panel reports a successful card creation message.

### What to Inspect in Rust Logs

- Session creation:
  - `[ACP Route] Creating session: provider=Some("opencode")`
- MCP injection:
  - `[AcpManager] opencode: wrote MCP config to /Users/phodal/.config/opencode/opencode.json`
- MCP handshake:
  - `[MCP Route] POST: method=initialize`
  - `[MCP Route] POST: method=tools/list`
- Actual tool use:
  - `[MCP Route] POST: method=tools/call`

### Expected Evidence

- `~/.config/opencode/opencode.json` contains a `routa-coordination` entry pointing at the Rust desktop server:
  - `http://127.0.0.1:3210/api/mcp?...&toolMode=full&mcpProfile=kanban-planning`
- The `Backlog` count increases.
- The unique verification card is visible in the board, for example:
  - `VERIFY-KANBAN-OPENCODE-20260320`
  - `VERIFY-KANBAN-OPENCODE-20260320-B`
- The KanbanTask Agent panel shows a creation summary such as:
  - `Created backlog card ... in the backlog column.`

### Why This Replay Matters

- It verifies the missing Rust capability that was previously absent:
  - `session/new` must preserve `toolMode=full` and `mcpProfile=kanban-planning`
- It proves the desktop Rust backend is not only serving Kanban, but also enabling OpenCode to call the Kanban MCP tools needed for backlog decomposition and card creation.

## Follow-up Verification: Cross-Column Lane Transition Automation

This replay verified that Rust desktop Kanban automation also works when a card is
moved between lanes, not only when it is created directly inside an automated lane.

### Replay Workspace

- Workspace:
  - `rust-fix-enabled-1773965081`
- Board:
  - `shared-import-board`
- Lane automation:
  - `todo -> OpenCode / CRAFTER / entry`

### Replay Steps

1. Seed a backlog card:
   - `BROWSER-MOVE-VERIFY-1773965081`
2. Open:
   - `http://127.0.0.1:3210/workspace/rust-fix-enabled-1773965081/kanban`
3. Confirm the board initially shows:
   - `Backlog 1 cards`
   - `Todo 1 cards`
4. Move the seeded card from `backlog` to `todo` through the Rust task update path:
   - `PATCH /api/tasks/c569b0ee-5916-4d60-a41e-4ad05e9e7016`
   - body:
     - `{"columnId":"todo","boardId":"shared-import-board"}`
5. Refresh the board UI and inspect task/session state.

### Expected Evidence

- The moved card now carries:
  - `assignedProvider = "opencode"`
  - `assignedRole = "CRAFTER"`
  - `triggerSessionId = "b71a5908-063e-49b5-9118-d8f696913017"`
- `GET /api/sessions?workspaceId=rust-fix-enabled-1773965081` returns a matching session:
  - `provider = "opencode"`
  - `role = "CRAFTER"`
  - `sessionId = "b71a5908-063e-49b5-9118-d8f696913017"`
- Browser output after refresh shows the lane transition:
  - `Backlog 0 cards`
  - `Todo 2 cards`
  - `BROWSER-MOVE-VERIFY-1773965081`

### Why This Replay Matters

- It proves the Rust desktop Kanban transition path triggers automation when a card enters an automated lane after creation.
- It closes the gap between "entry automation on create" and "entry automation on lane transition".

## Follow-up Verification: Input to Dev Auto Chain

This replay extends the previous checks to a longer Rust desktop path:

- `Kanban input -> Backlog -> Todo -> Dev`

### Replay Workspace

- Workspace:
  - `rust-auto-chain-import-1773967200`
- Board:
  - `imported-auto-chain-board`

### Replay Notes

- Import a board config first, then ensure the imported board contains six columns.
- Configure both `todo` and `dev` with:
  - `enabled = true`
  - `providerId = "opencode"`
  - `role = "CRAFTER"`
  - `transitionType = "entry"`
- Use the top Kanban input to create a backlog card, then move that same card across both automated lanes.

### Expected Evidence

- The card is visible in `Backlog` after input planning.
- Moving it to `Todo` creates a fresh `OpenCode` session.
- Moving it again to `Dev` also creates a fresh `OpenCode` session instead of being suppressed by the previous `triggerSessionId`.
