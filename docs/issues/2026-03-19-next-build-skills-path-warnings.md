---
title: "Next build emits persistent skills path and route config warnings"
date: "2026-03-19"
status: resolved
severity: medium
area: "build"
tags: [nextjs, turbopack, build, skills, github-webhook, warnings]
reported_by: "Codex"
related_issues: []
---

# Next build emits persistent skills path and route config warnings

## What Happened

`npm run build` completes successfully, but the build consistently emits a cluster of warnings unrelated to the specialist/session changes made in this round.

Observed warnings include:

- Next.js cannot statically recognize the exported `config` object in `src/app/api/webhooks/github/route.ts`.
- Turbopack reports overly broad file patterns when evaluating dynamic path joins and `fs.existsSync` / `fs.statSync` access in the skills catalog and skill loader code.
- Similar pattern warnings also surface through `src/core/github/github-issue-sync.ts` because it is imported by routes that participate in the build graph.

The result is a noisy build output where real regressions are harder to spot, and route-level filesystem scanning appears broader than intended.

## Expected Behavior

- `npm run build` should complete without these repeated warnings.
- Route modules should not rely on patterns that cause Turbopack to infer extremely broad filesystem globs.
- Deprecated or ignored route config exports should not remain in production build paths.

## Reproduction Context

- Environment: web
- Trigger: running `npm run build` in the main repository on 2026-03-19 during specialist/session validation

## Why This Might Happen

- The GitHub webhook route still exports a legacy `config` object that App Router no longer wants to parse in this form.
- The skills catalog route appears to build candidate paths dynamically enough that Turbopack widens them into large filesystem match sets.
- The shared skill-loading utilities likely expose the same broad path behavior to multiple routes, amplifying the warning count.
- Build-time static analysis may be following imports that mix route code, local skill discovery, and GitHub issue sync helpers in a way that expands the scanned surface area.

## Relevant Files

- `src/app/api/webhooks/github/route.ts`
- `src/app/api/skills/catalog/route.ts`
- `src/core/skills/skill-loader.ts`
- `src/core/github/github-issue-sync.ts`

## Observations

- The warning set reproduced twice during this round while validating `feat(specialist): persist execution defaults in db and api` and `feat(session): inherit specialist defaults in web session creation`.
- TypeScript and page generation still completed successfully after the warnings.
- The warnings predated the changes in this round and were not introduced by the specialist/session work.

## References

- Local validation run on 2026-03-19 with `npm run build`

## Resolution

- Narrowed the skills catalog filesystem path expansion by replacing repeated dynamic search loops with stable helper-based candidate resolution in `src/app/api/skills/catalog/route.ts`.
- Narrowed shared skill discovery path construction in `src/core/skills/skill-loader.ts` so project/global/repo scans no longer build paths through generic loop variables that widened Turbopack tracing.
- Reduced unrelated build-graph pull-in by changing `src/app/api/github/tree/route.ts` to import `getCachedWorkspace` directly from `github-workspace` instead of the `@/core/github` barrel.
- Simplified prior-content lookup in `src/core/github/github-issue-sync.ts` so file existence and read checks no longer depend on a merged dynamic path variable.
- Confirmed the earlier webhook `config` warning referenced in this issue was stale; `src/app/api/webhooks/github/route.ts` already only exports `dynamic = "force-dynamic"`.

## Verification

- `npm run build` completed on 2026-03-28 without the previous Turbopack skills path warnings.
- `entrix run --tier normal` completed with overall `PASS` on 2026-03-28.
