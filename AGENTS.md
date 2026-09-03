# Routa.js — Multi-agent coordination platform with dual-backend architecture (Next.js + Rust/Axum).

Routa.js is a workspace-first multi-agent coordination platform with two runtime surfaces:

- Web: Next.js app and API in `src/`
- Desktop: Tauri app in `apps/desktop/` backed by Axum in `crates/routa-server/`

The project is intentionally not "two separate products". Web and desktop differ in deployment model and storage, but they are expected to preserve the same domain semantics, API shape, and agent-coordination behavior.

- `docs/ARCHITECTURE.md`: Canonical architecture boundaries, domain model, protocol stack, and cross-backend invariants.
- `docs/adr/`: Durable architectural decisions. Start here for "why".
- `docs/design-docs/`: Human-reviewed design intent and normalized decisions migrated from `.kiro/specs/`.

## Coding Standards

- General coding style guidance lives in `docs/coding-style.md`; keep this file focused on routing and repo-level guardrails.
- Source of truth for executable gates is `docs/fitness/` + `entrix`; do not restate tool-level checks here.
- Frontend and desktop API calls in `src/app` and `src/client` should use `resolveApiPath` + `desktopAwareFetch` for统一的后端路径组装：
  - `resolveApiPath`（`src/client/config/backend.ts`）：统一补全 `/api` 前缀并在需要时拼接后端 base URL。
  - `desktopAwareFetch`（`src/client/utils/diagnostics.ts`）：在 Tauri 桌面静态运行时自动落到 `http://127.0.0.1:3210` 或配置的后端地址。
  - 避免在前端/桌面再次直接写 `fetch('/api/...')`。
- For long behavior-heavy files, prefer **orchestration shell + domain hooks** over UI-only slicing.
- Apply the same pattern to oversized API routes: thin top-level route, extract workflow branches (session creation, streaming, provider dispatch, etc.).
- Split route refactors by workflow branch before shared helpers; avoid premature generic `utils`.
- Before large behavior refactors, add or extend characterization tests that lock routing/lifecycle/persistence/recovery behavior.
- All UI-facing strings must go through the i18n system (e.g., `t('key')`). Do not hardcode English or Chinese literals in components.

## Testing and Debugging

- Use `agent-browser` (or Electron/browser skills) for manual walkthroughs and visual evidence capture.
- Use Playwright e2e for automated UI coverage.
- Tauri UI smoke path: `npm run tauri dev`, then validate via `http://127.0.0.1:3210/`.
- If Tauri routes look wrong, verify fallback mapping in `crates/routa-server/src/lib.rs` and placeholders in `out/workspace/__placeholder__/`.
- For large or cross-core changes, run graph probes first: `entrix graph impact`, `entrix graph test-radius`, or `entrix graph review-context`.
- Temporary frontend debug `console.log` is allowed during diagnosis; remove all debug logs before finish.
- Do not commit screenshots, recordings, large generated binaries, or other non-automated-test artifacts. Keep manual QA evidence in ignored temp paths or attach it externally to the PR.
- Shared repo-level agent skills live under `.agents/skills/`. The canonical release automation skill is `.agents/skills/release/` and should be invoked as `/release`.

## Validation

Before PR, run `entrix` using `docs/fitness/README.md` as canonical rulebook.

```bash
entrix run --dry-run
entrix run --tier fast
entrix run --tier normal   # when behavior/shared modules/APIs/workflow orchestration changed
```

- If a check fails, fix and re-run; do not skip.
- Skip source-code validation only when changes are strictly non-code (`*.md`, `*.yml`, `*.yaml`, `.github/`, `docs/`, etc.).
- Build if needed: `cargo build -p entrix`.

## Repository Map

- `docs/product-specs/FEATURE_TREE.md`: Auto-generated product and API surface index. Start here for route and endpoint discovery.
- `docs/exec-plans/active/`: Short-lived implementation plans for in-flight work.
- `docs/exec-plans/completed/`: Archived plans that reflect what shipped.
- `docs/exec-plans/tech-debt-tracker.md`: Cross-cutting debt ledger.
- `docs/issues/`: Incident and repro records. Capture WHAT happened and WHY it mattered.
- `docs/fitness/`: Executable quality/testing/contract rulebook consumed by `entrix`.
- `docs/coding-style.md`: Canonical coding style guidance for Rust, TypeScript/frontend, naming, and testing preferences.
- `docs/REFACTOR.md`: Long-file refactor playbook.
- `docs/references/`: Distilled external references for frequent dependencies.
- `docs/release-guide.md`: Full release guide for CLI/Desktop/distribution.
- `docs/RELEASE_CHECKLIST.md`: Quick release checklist.
- `crates/entrix/`: Entrix runtime and CLI implementation.

## Reading Order

When starting work on this repository, read in this order:

1. `docs/ARCHITECTURE.md` — runtime topology and boundaries.
2. `docs/adr/README.md` — decision index, then relevant ADRs.
3. `docs/fitness/README.md` — quality gates and verification flow.
4. Task-specific files in `docs/design-docs/` or `docs/exec-plans/`.
