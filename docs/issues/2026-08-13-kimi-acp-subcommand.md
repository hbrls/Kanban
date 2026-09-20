---
title: "Built-in Kimi provider must use the ACP subcommand"
date: "2026-08-13"
kind: issue
status: resolved
severity: high
area: acp
tags: [kimi, acp, provider, cli, compatibility]
reported_by: "MTFish-TYT"
github_issue: 583
github_state: closed
github_url: "https://github.com/phodal/routa/issues/583"
resolved_at: "2026-08-13"
---

# Built-in Kimi provider must use the ACP subcommand

## What Happened

Kimi Code CLI removed the legacy global `--acp` option. Its ACP transport is
started with the `acp` subcommand, so a built-in provider configured as
`kimi --acp` exits before the ACP handshake.

## Resolution

The current TypeScript and Rust built-in presets already resolve Kimi to the
same process contract:

```text
command: kimi
args: [acp]
```

Characterization tests now lock that contract in both backends so the provider
cannot silently regress to the removed `--acp` form.

## Verification

- `src/core/acp/__tests__/acp-presets.test.ts`
- `crates/routa-core/src/acp/mod.rs`

The local environment did not have a `kimi` executable, so verification covers
Routa's command construction rather than a live Kimi ACP handshake.
