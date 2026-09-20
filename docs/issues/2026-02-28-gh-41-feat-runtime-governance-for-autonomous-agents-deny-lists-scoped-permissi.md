---
title: "[GitHub #41] feat: Runtime governance for autonomous agents — deny lists, scoped permissions, audit trail"
date: "2026-02-28"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-41"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/41"]
github_issue: 41
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/41"
---

# [GitHub #41] feat: Runtime governance for autonomous agents — deny lists, scoped permissions, audit trail

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #41
- URL: https://github.com/phodal/routa/issues/41
- State: closed
- Author: phodal
- Created At: 2026-02-28T12:10:32Z
- Updated At: 2026-02-28T12:10:32Z

## Labels

- (none)

## Original GitHub Body

## Background

From [background-agents.com](https://background-agents.com/): Agents are actors in your system. They need the same controls as human contributors — identity, permissions, audit trails. Governance enforced by a system prompt is a suggestion; governance enforced at the execution layer is actual governance.

## Motivation

As Routa moves toward autonomous background agents (scheduled, webhook-triggered, fleet), security becomes critical. Currently there are no runtime-enforced restrictions on what an agent can do. Security teams require deny lists, scoped credentials, and audit trails before approving autonomous agent deployments.

## Proposed Solution

A governance layer wrapping each ACP agent execution:

### 1. Deny lists
- Configurable per workspace: blocked commands, blocked file paths, blocked external domains
- Enforced at the tool-call level (before MCP tools are invoked)
- Example: agents in prod-adjacent workspaces cannot run `rm -rf`, cannot push directly to `main`

### 2. Scoped credentials  
- Each agent run receives only the secrets it explicitly needs (not all workspace secrets)
- Secret scoping defined in the trigger config or fleet spec

### 3. Audit trail
- Every tool call (file write, shell command, git push) logged to the existing `traces` table with agent identity + timestamp
- New UI view: per-workspace governance audit log
- Alerting on policy violations

### 4. Agent identity
- Each background agent run has a `run_id` and `triggered_by` (schedule / webhook / user) surfaced in the UI

## References

- https://background-agents.com/ (Governance section)
- Existing trace infra: `src/core/trace/`, `src/app/traces/`
