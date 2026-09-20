---
title: "Main security gates fail on inherited secrets and critical npm advisories"
date: "2026-07-29"
kind: issue
status: resolved
severity: high
area: "ci-security"
tags: ["github-actions", "semgrep", "npm-audit", "release"]
reported_by: "github-actions"
related_issues: ["https://github.com/phodal/routa/actions/runs/30409414590"]
github_issue: null
github_state: null
github_url: null
---

# Main security gates fail on inherited secrets and critical npm advisories

## What Happened

The Defense workflow for `main` failed in two security jobs:

- Semgrep reported six blocking `secrets-inherit` findings in `.github/workflows/release.yml`.
- `npm audit --audit-level=critical` reported critical findings in the locked
  `shell-quote` and `websocket-driver` versions.

## Expected Behavior

Reusable release workflows receive only the repository secrets they consume, and the
locked dependency graph contains no critical npm advisories.

## Reproduction Context

- Environment: GitHub Actions on `main`
- Trigger: push of commit `2c7293e02fb92c0e936cdd7670b1f52115ad2851`
- Run: https://github.com/phodal/routa/actions/runs/30409414590

## Why This Happened

- The release orchestrator used `secrets: inherit` for every reusable workflow call,
  which grants a wider secret set than each workflow requires.
- The package lock still selected `shell-quote@1.8.3` and
  `websocket-driver@0.7.4` after new advisories marked those versions vulnerable.

## Relevant Files

- `.github/workflows/release.yml`
- `.github/workflows/tauri-release.yml`
- `.github/workflows/cli-release.yml`
- `.github/workflows/harness-monitor-release.yml`
- `.github/workflows/entrix-release.yml`
- `.github/workflows/cargo-release.yml`
- `package-lock.json`

## Verification Plan

- Run the same strict Semgrep command used by the Defense workflow.
- Run `npm audit --audit-level=critical` after a clean install.
- Run the repository Entrix dry-run, fast, and normal gates.
- Confirm both GitHub Actions jobs succeed after the fix reaches `main`.

## Resolution

- Replaced every `secrets: inherit` call with an explicit per-workflow secret map.
- Declared only the repository secrets consumed by each reusable release workflow;
  the automatically scoped `GITHUB_TOKEN` remains implicit.
- Refreshed the dependency graph and upgraded the runtime packages behind the
  OpenTelemetry, Hono, Next.js, PostCSS, protobufjs, sharp, shell-quote, and
  websocket-driver advisories.
- Updated the PowerPoint comparison helper for the sharp 0.35 type contract.

## Verification

- Strict Semgrep scan: passed with zero blocking findings.
- Actionlint on all changed reusable release workflows: passed.
- Clean `npm ci`: passed.
- Production npm audit: zero high and zero critical findings; one low finding remains.
- `entrix run --dry-run`: 100%.
- `entrix run --tier fast`: 100%.
- `entrix run --tier normal --dimension security`: 100%.
- Vitest: 374 files passed, 2285 tests passed, 1 file and 23 tests skipped.
- OpenTelemetry trace smoke and Next.js production build: passed.

A full local normal-tier attempt also exposed the repository's existing 61.1% line
coverage against an 80% threshold. Its Rust test phase then exhausted local disk space
during linking. Neither condition was caused by the security changes; the relevant
security dimension and full TypeScript suite were rerun successfully after cleanup.
