# Fitness V2 Schema

Issue: #217  
Parent: #181

## Goal

Define a backward-compatible Fitness V2 metric schema before upgrading runner, scoring, and CI behavior.

## Compatibility

- Existing V1 frontmatter remains valid.
- Missing V2 fields fall back to current behavior.
- Unknown fields are ignored by the loader.

## V2 Metric Fields

```yaml
metrics:
  - name: tracing_signal_available
    command: ./scripts/obs/check-tracing-signal.sh 2>&1
    pattern: "signal_ok"
    hard_gate: false
    tier: deep
    description: "Verify tracing signal in staging"

    execution_scope: staging
    gate: soft
    kind: holistic
    analysis: dynamic
    stability: noisy
    evidence_type: probe
    scope: [web, rust]
    run_when_changed:
      - src/instrumentation.ts
      - crates/routa-server/src/telemetry/**
    timeout_seconds: 120
    owner: platform
    confidence: high
    waiver:
      reason: "legacy hotspot pending refactor"
      owner: phodal
      tracking_issue: 999
      expires_at: 2026-04-30
```

## Field Defaults

| Field | Default |
|------|---------|
| `execution_scope` | `local` |
| `gate` | derive from `hard_gate` |
| `kind` | `atomic` |
| `analysis` | `static` |
| `stability` | `deterministic` |
| `evidence_type` | `command` |
| `scope` | `[]` |
| `run_when_changed` | `[]` |
| `timeout_seconds` | unset |
| `owner` | empty string |
| `confidence` | `unknown` |
| `waiver` | unset |

## Result States

- `PASS`
- `FAIL`
- `UNKNOWN`
- `SKIPPED`
- `WAIVED`

Phase 1 only introduces the state model in code. Scoring and governance semantics are upgraded in later phases.
