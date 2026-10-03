# Tech Debt Tracker

This file tracks cross-cutting debt that should be reduced deliberately instead of rediscovered repeatedly.

## How To Use This File

- add debt that spans multiple modules, plans, or releases
- link to the relevant issue, incident note, or PR when available
- prefer concrete debt statements over vague dissatisfaction
- remove or rewrite entries once the debt is paid down or reframed

## Current Seed Items

| Area | Debt | Evidence | Suggested Next Move |
|---|---|---|---|
| Documentation architecture | Durable knowledge is split between `docs/` and `.kiro/specs/` | Issue `#85`, local sync note in `docs/issues/2026-03-08-gh-85-readability-agent-first-knowledge-architecture-repository-as-system-of-r.md` | Normalize high-value specs into `docs/design-docs/` incrementally |
| Repository readability | `docs/references/` does not exist yet, so agent-facing dependency references are still scattered | Issue `#85` | Start with high-frequency references for ACP, Tauri, and Drizzle |
| Quality visibility | No canonical `docs/QUALITY_SCORE.md` exists yet | Issue `#85` | Define a lightweight manual scorecard before building automation |
