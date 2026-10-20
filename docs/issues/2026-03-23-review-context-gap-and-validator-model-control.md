---
title: "Review pipeline lacks graph context and per-validator model control"
date: "2026-03-23"
status: resolved
severity: medium
area: "backend"
tags: ["review", "quality", "agent", "backend", "frontend-api"]
reported_by: "codex"
related_issues: ["https://github.com/phodal/routa/issues/227"]
github_issue: 227
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/227"
---

# Review pipeline lacks graph context and per-validator model control

## What happened

The current review analyze pipeline uses git diff plus a small set of config snippets as the main review payload. It does not include graph-derived impact/test-radius review context that already exists in `entrix graph review-context`.

The same model override is applied uniformly across all review workers (`context`, `candidates`, `validator`). There is no way to force only the validator phase to use a specific Claude model for targeted false-positive filtering tests.

## Why it matters

- Diff-only context weakens review quality on cross-module changes and increases missed dependencies.
- Validator quality is the highest leverage stage for precision. Without per-phase model control, it is hard to run controlled experiments (for example, validator-on-Claude while keeping earlier phases unchanged).
- Missing these controls slows down quality iteration and weakens trust in review output signal-to-noise.

## Resolution notes

- Added `graphReviewContext` / `graph_review_context` payload injection by invoking `entrix graph review-context --base <base> --json` in:
  - Next.js review pipeline
  - Rust review API
  - Rust CLI review analyze payload builder
- Added per-validator model override support:
  - Web API request field: `validatorModel`
  - Rust API request field: `validator_model` (camelCase JSON: `validatorModel`)
  - CLI flag: `--validator-model` (with shared `--model` fallback for other workers)
- Verified by targeted tests and build checks; GitHub issue #227 closed.
