---
title: "Rust fitness lacks an application/use-case test layer between store tests and API tests"
date: "2026-03-13"
status: resolved
severity: medium
area: "fitness"
tags: ["rust", "fitness", "testing", "api-contract", "usecase", "architecture"]
reported_by: "codex"
related_issues: []
resolved_date: "2026-03-19"
resolved_by: "Codex (GPT-5)"
---

# Rust fitness 缺少连接领域规则与 API 契约的应用/用例测试层

## What Happened

当前 Rust fitness 的证据主要落在两端：

- 一端是 `docs/fitness/unit-test.md` 中声明的 `store` / 规则映射类单元测试条目，但大部分仍为 `TODO`
- 另一端是 `docs/fitness/rust-api-test.md` 中的 endpoint 级 API 回归与 `crates/routa-server/tests/rust_api_end_to_end.rs` 中的大型端到端测试

在实际代码中，若干业务编排逻辑没有独立的 application/use-case 承载层，而是直接位于 Axum handler 内，包括：

- task 创建与更新时的默认 board/column/status 推导
- `columnId` 与 `status` 的一致性校验
- 进入 `dev` 列后触发 agent session 的条件判断
- GitHub issue 同步与错误回填
- session 查询时内存态与数据库态的合并、去重、排序、过滤

这导致当前 Rust fitness 中的“业务驱动 API 测试”同时承担了接口契约验证与业务规则验证两类职责。

## Expected Behavior

Rust fitness 应该能够分层表达并验证：

- 领域规则 / store 行为
- 应用层业务用例与编排逻辑
- API 契约、错误映射与跨后端 parity

业务规则的主要证据不应只能依赖 HTTP 入口测试来证明。

## Reproduction Context

- Environment: both
- Trigger: 分析 Rust fitness 结构时，发现 `unit-test.md` 与 `rust-api-test.md` 之间缺少一层能够直接承载业务用例的测试对象，导致很多与业务相关的断言只能通过 handler 级 API 测试间接覆盖

## Why This Might Happen

- 当前 `AppState` 直接向 handler 暴露多个 store 和 manager，应用层编排对象未形成稳定边界，业务逻辑自然聚集到 handler
- 现有 `tests/api-contract` 与 Rust e2e 测试更偏向契约/回归/双后端一致性验证，不适合承载 Rust 独有的业务不变量
- `docs/fitness/README.md` 已要求业务规则变化要有单元测试，但代码组织没有提供足够清晰的落点来承载这些测试
- 由于缺少中间层，fitness 评分会被迫把业务信心建立在 endpoint 测试数量上，而不是建立在可复用的业务场景验证上

## Relevant Files

- `docs/fitness/README.md`
- `docs/fitness/unit-test.md`
- `docs/fitness/rust-api-test.md`
- `crates/routa-server/tests/rust_api_end_to_end.rs`
- `crates/routa-server/src/api/tasks.rs`
- `crates/routa-server/src/api/sessions.rs`
- `crates/routa-core/src/state.rs`

## Observations

- `docs/fitness/unit-test.md` 中 `routa-core` 的 store 级条目和 `workflow/规则映射层` 条目大多仍未验证
- `docs/fitness/rust-api-test.md` 当前以端点矩阵为核心证据来源，业务跨端点回归项仍未补齐
- `crates/routa-server/src/api/tasks.rs` 同时承担请求解析、业务规则推导、外部副作用触发与持久化
- `crates/routa-server/src/api/sessions.rs` 在 handler 内完成 session 数据源合并与排序逻辑，缺少独立业务查询层

## Resolution

- `crates/routa-server/src/application/tasks.rs` 抽出了 task create/update 的应用层编排，并提供独立 Rust 测试。
- `crates/routa-server/src/application/sessions.rs` 新增 session 应用层，承载 list/history/context 的合并、筛选、排序和 fallback 规则，并提供独立 Rust 测试。
- `crates/routa-server/src/api/tasks.rs` 与 `crates/routa-server/src/api/sessions.rs` 已改为委托 application service 处理业务编排。
- `docs/fitness/unit-test.md` 已补充 application/use-case: tasks 和 application/use-case: sessions 的 `VERIFIED` 证据条目。

## References

- `docs/fitness/README.md`
- `docs/fitness/unit-test.md`
- `docs/fitness/rust-api-test.md`
