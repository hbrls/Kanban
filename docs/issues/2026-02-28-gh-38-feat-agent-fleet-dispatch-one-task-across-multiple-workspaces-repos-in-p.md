---
title: "[GitHub #38] feat: Agent fleet — dispatch one task across multiple workspaces/repos in parallel"
date: "2026-02-28"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-38"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/38"]
github_issue: 38
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/38"
---

# [GitHub #38] feat: Agent fleet — dispatch one task across multiple workspaces/repos in parallel

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #38
- URL: https://github.com/phodal/routa/issues/38
- State: closed
- Author: phodal
- Created At: 2026-02-28T12:10:27Z
- Updated At: 2026-03-12T10:04:17Z

## Labels

- (none)

## Original GitHub Body

## Background

From [background-agents.com](https://background-agents.com/): Updating one repository is a coding agent task. Updating 500 is a fleet task. The same sandbox, replicated across every repository — parallel provisioning, progress tracking, aggregated results.

## Motivation

Routa currently operates on a single workspace per session. In organizations with many repositories, the same change (e.g., upgrade a shared library, enforce a lint rule, apply a security patch) must be applied across many repos. There is no fleet-level coordination today.

## Proposed Solution

A Fleet dispatch system: 

- **Fleet API**: `POST /api/fleet` with `{ task_prompt, workspace_ids[] }`
- **Fleet record** in DB: masters over multiple agent runs, tracks per-repo status
- **Parallel execution**: spawn independent ACP sessions per workspace, all running the same prompt
- **Aggregated results UI**: fleet dashboard showing per-repo status (in-progress / success / failed) and PR links
- **Fleet from workspace UI**: a multi-select workspace picker + prompt → dispatch

## Use Cases

- Apply a security patch to all repos that use a vulnerable dependency
- Enforce a new ESLint rule across all frontend repositories
- Migrate CI config from CircleCI to GitHub Actions across 50 repos

## References

- https://background-agents.com/ (Fleet Coordination section)
