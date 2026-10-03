---
title: "[GitHub #312] Design: Optional Review Trigger System with OpenAI-style Security Gates and Claude-style Review Agents"
date: "2026-04-21"
kind: issue
status: resolved
severity: medium
area: "backend"
tags:
  - github
  - github-sync
  - gh-312
  - enhancement
  - area-backend
  - area-api
  - complexity-medium
  - review-trigger
reported_by: "phodal"
related_issues:
  - "https://github.com/phodal/routa/issues/312"
github_issue: 312
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/312"
resolved_at: "2026-04-21"
---

# [GitHub #312] Design: Optional Review Trigger System with OpenAI-style Security Gates and Claude-style Review Agents

## What Happened

- GitHub issue `#312` described a design gap in the review-trigger system: triggers were expected to support optional or progressive escalation instead of only hard binary gating.
- By 2026-04-21, the core behavior requested by the issue had already been implemented in the repository, but the GitHub issue remained open.

## Expected Behavior

- Review triggers should support advisory, staged, blocking, and human-review escalation modes.
- Automatic review should be confidence-aware, allow layered fallback, and support more than one review provider.
- GitHub automated review requests should reflect repository review-trigger policy instead of acting as a generic review prompt.

## Reproduction Context

- Environment: both web + desktop governance flows
- Trigger:
  - Inspect `docs/fitness/review-triggers.yaml`
  - Inspect `src/core/harness/review-triggers.ts`
  - Inspect `tools/hook-runtime/src/review.ts`
  - Inspect `tools/hook-runtime/src/specialist-review.ts`
  - Inspect `src/core/github/review-trigger-pr-review.ts`

## Why This Might Happen

- The issue stayed open after the main implementation landed because the delivery was split across multiple commits and no local issue tracker had been added for closure bookkeeping.
- The original GitHub issue body reflected the earlier design intent, but not the current implementation state.

## Relevant Files

- `docs/fitness/review-triggers.yaml`
- `src/core/harness/review-triggers.ts`
- `tools/hook-runtime/src/review.ts`
- `tools/hook-runtime/src/specialist-review.ts`
- `src/core/github/review-trigger-pr-review.ts`
- `.github/scripts/copilot-complete-handler.ts`

## Observations

- The review-trigger schema now supports `advisory`, `block`, `require_human_review`, and `staged` actions.
- Staged review supports `confidence_threshold`, `fallback_action`, provider/model overrides, and layered review routing.
- The hook runtime now escalates on low-confidence or explicit `escalate` outcomes and can fall back to advisory, block, or human review.
- Automatic review providers now support Claude, Codex/OpenAI, and Anthropic-compatible routing with fallback handling.
- GitHub automated review comments now incorporate matched trigger reasons and policy guidance.
- The main implementation landed in:
  - `b810a792` `feat(review-trigger): add staged pre-push review actions`
  - `3889ef13` `feat(github): make copilot review requests trigger-aware`

## Resolution

- Issue `#312` is considered resolved because the requested staged, confidence-aware, provider-flexible review-trigger design is now implemented in the repository.
- Remaining future work, if any, should be tracked as narrower follow-up issues for policy tuning or UX refinement rather than keeping this umbrella design issue open.

## References

- https://github.com/phodal/routa/issues/312
- `b810a792`
- `3889ef13`
