---
title: "Desktop workspace route diagnosis obscured by DB and port mismatch"
date: "2026-04-02"
status: investigating
severity: high
area: desktop
tags: ["desktop", "tauri", "workspace", "database", "routing", "incident"]
reported_by: "codex"
related_issues:
  - "2026-03-19-tauri-kanban-static-routing-regression.md"
---

# Desktop workspace route diagnosis obscured by DB and port mismatch

## What Happened

- User reported that the Rust desktop build failed when navigating to:
  - `/workspace/default/kanban`
  - `/workspace/default/overview`
  - `/workspace/default/team`
- The same routes were reported as working in the browser, which initially suggested a desktop-only routing regression.
- During investigation, a previously launched `target/debug/examples/standalone_server` was still listening on `127.0.0.1:3210`.
- A newly launched `./target/release/routa-desktop` did not actually own the port on its first run and logged:
  - `Failed to start server: Failed to bind to 127.0.0.1:3210: Address already in use (os error 48)`
- This meant earlier browser checks against `http://127.0.0.1:3210` were hitting the stale standalone Rust server instead of the newly rebuilt Tauri desktop backend.
- The desktop data source was also ambiguous:
  - `~/Library/Application Support/com.routa.desktop/routa.db` contains the desktop app data.
  - `/Users/phodal/.routa/routa.db` exists but is a `0`-byte file.
  - The visible repository path in the desktop UI was `/Users/phodal/.routa/repos/phodal--routa`.
- Quick SQLite inspection showed the desktop app DB contains `default` plus several test workspaces, but the observed codebase row was attached to `Desktop Smoke Workspace`, not `default`.

## Expected Behavior

- When the desktop app is launched, it should unambiguously own `127.0.0.1:3210` or fail loudly enough that verification cannot mistake another process for the active backend.
- The desktop app should make it obvious which SQLite database file it is using.
- The workspace currently shown in the UI should map coherently to the codebase and repo path visible in the shell, without requiring cross-checking multiple DB files.

## Reproduction Context

- Environment: desktop
- Trigger:
  - Launch desktop app after a previous standalone Rust server has already bound `127.0.0.1:3210`
  - Navigate to workspace routes and inspect UI/data assumptions
  - Compare Tauri-visible workspace state with local DB files under `~/Library/Application Support/com.routa.desktop/` and `~/.routa/`

## Why This Might Happen

- The desktop verification loop may assume `127.0.0.1:3210` always belongs to the most recently launched Tauri process, but stale standalone Rust servers can keep serving an older DB and older static frontend.
- Desktop runtime state is split across at least two concepts:
  - the SQLite database path chosen by Tauri
  - repository folders under `~/.routa/repos/...`
  This can make a repo path look "current" even when the active DB is not the one the investigator expects.
- The UI may preserve or hydrate workspace/repo state in a way that looks valid even when the underlying DB/codebase mapping differs from the expected default workspace.
- Because `default` workspace auto-bootstrap and default board bootstrap happen even on a fresh DB, a route can partially render and look like a workspace issue when the deeper problem is actually missing codebases or mixed runtime state.

## Relevant Files

- `apps/desktop/src-tauri/src/lib.rs`
- `crates/routa-server/src/lib.rs`
- `src/app/workspace/[workspaceId]/workspace-page-client.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx`
- `docs/issues/2026-03-19-tauri-kanban-static-routing-regression.md`

## Observations

- Tauri startup log from rebuilt desktop binary:
  - `Database path: /Users/phodal/Library/Application Support/com.routa.desktop/routa.db`
  - `Failed to bind to 127.0.0.1:3210: Address already in use`
- Stale process that blocked the port:
  - `target/debug/examples/standalone_server`
- After killing the stale standalone server and relaunching the rebuilt desktop app, the desktop backend reported:
  - `version: 0.2.11`
- Querying the rebuilt app while pointed at `/Users/phodal/.routa/routa.db` produced:
  - `default` workspace exists
  - default board exists
  - no codebases
  - no sessions
- Querying `/Users/phodal/Library/Application Support/com.routa.desktop/routa.db` directly showed:
  - `default|Default Workspace`
  - multiple test workspaces
  - one visible codebase row under `Desktop Smoke Workspace`
- This leaves one unresolved question:
  - why the user-visible desktop UI showed repo context under `Default Workspace` when the quick DB inspection did not show a `default`-workspace codebase row in the desktop app DB.

## References

- `target/debug/examples/standalone_server`
- `target/release/routa-desktop`
- `/Users/phodal/Library/Application Support/com.routa.desktop/routa.db`
- `/Users/phodal/.routa/routa.db`

## Issue Hygiene

- 2026-04-28: reviewed as still active. The record is an environment-sensitive desktop diagnosis gap, and there is no durable follow-up proving the DB/port ownership confusion has been eliminated.
