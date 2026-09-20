---
dimension: observability
weight: 0
threshold:
  pass: 80
  warn: 70
metrics:
  - name: web_instrumentation_entrypoint_present
    command: |
      rg -q 'export async function register|startSchedulerService|startBackgroundWorker|initializeNextRuntimeTelemetry' src/instrumentation.ts && \
      echo 'observability_instrumentation_ok'
    pattern: "observability_instrumentation_ok"
    tier: fast
    execution_scope: ci
    gate: soft
    kind: atomic
    analysis: static
    evidence_type: command
    scope: [web]
    run_when_changed:
      - src/instrumentation.ts
      - src/core/background-worker.ts
      - src/core/scheduling/**
    description: "Next.js instrumentation 入口继续接通后台 worker / scheduler 启动链"

  - name: web_otel_trace_smoke
    command: npm run test:otel:trace 2>&1
    pattern: "✅ otel_trace_smoke"
    tier: deep
    execution_scope: ci
    gate: advisory
    kind: holistic
    analysis: dynamic
    stability: noisy
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/instrumentation.ts
      - src/core/telemetry/**
      - scripts/fitness/check-otel-trace-smoke.ts
      - package.json
      - package-lock.json
    description: "当显式开启 ROUTA_OTEL_ENABLED 时，Next.js Node runtime 会输出最小可验证的 OTel span"

  - name: runtime_error_visibility_contract
    command: |
      rg -q 'maps runtime error notifications into session acpStatus metadata' \
        src/core/acp/__tests__/http-session-store-acp-status.test.ts && \
      rg -q 'acpStatus: "error"' \
        'src/app/api/sessions/[sessionId]/__tests__/route.test.ts' && \
      echo 'observability_runtime_error_contract_ok'
    pattern: "observability_runtime_error_contract_ok"
    tier: normal
    execution_scope: ci
    gate: soft
    kind: atomic
    analysis: static
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/core/acp/**
      - src/app/api/sessions/**
    description: "ACP runtime error 继续透出为 session 状态与 API 契约，而不是只留在内部日志"

  - name: trace_recorder_regression_coverage
    command: |
      rg -q 'TraceRecorder' \
        src/core/acp/provider-adapter/__tests__/trace-recorder.test.ts \
        src/core/acp/provider-adapter/__tests__/integration-scenarios.test.ts && \
      echo 'observability_trace_recorder_ok'
    pattern: "observability_trace_recorder_ok"
    tier: normal
    execution_scope: ci
    gate: advisory
    kind: holistic
    analysis: static
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/core/acp/provider-adapter/**
      - src/core/trace/**
    description: "Trace recorder 关键回归覆盖仍在，避免 tool_call / tool_result / agent_message 可见性悄悄丢失"
---

# Observability Runtime Evidence

这份文件关注运行时可观测性是否还存在，而不是把 tracing 本身冒充成性能指标。

## 当前覆盖

- instrumentation 入口仍会启动后台 worker / scheduler
- 显式开启 `ROUTA_OTEL_ENABLED=1` 时，Next.js Node runtime 会把最小 bootstrap span 输出到本地 JSONL
- runtime error 会继续反映到 session `acpStatus` 与 API 输出
- trace recorder 的关键回归测试仍在，避免会话可见性静默退化

## 边界

- 这些指标证明的是“排障与运行时可见性还在”，不是“系统一定足够快”。
- 真正的 latency / FCP / long task 预算放在 `runtime/performance.md`。
