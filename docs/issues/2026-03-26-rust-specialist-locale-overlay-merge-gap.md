---
title: "Rust specialist loader lacks locale overlay merge semantics for runtime API responses"
date: "2026-03-26"
status: resolved
severity: medium
area: "backend"
tags: ["specialists", "i18n", "rust", "loader"]
reported_by: "codex"
related_issues: ["2026-03-19-specialist-resource-layout-drift-and-loader-divergence.md", "https://github.com/phodal/routa/issues/204", "https://github.com/phodal/routa/issues/233"]
---

# Rust specialist loader 仍缺少 locale overlay 合并语义

## What Happened

`resources/specialists` 已经完成 taxonomy + YAML-only 迁移，但 Rust 侧当前仍主要暴露“加载 base 目录”能力。

- `routa-core` 的 `SpecialistLoader` 会递归读取 runtime YAML，并跳过 `locales/` 目录
- Rust 测试已经验证 overlay 目录结构完整，但没有提供与 TypeScript `loadAllSpecialists(locale)` 对等的“base + locale overlay 合并”入口
- `crates/routa-server/src/api/specialists.rs` 的 `GET /api/specialists` 也没有接受 `locale` 查询参数，因此桌面/Rust 后端返回的 specialist 列表仍是默认语言内容

## Expected Behavior

- Rust specialist loader 提供明确的 locale-aware 加载入口
- base definitions 先加载，`locales/<locale>/` 或 legacy `<locale>/` overlay 再按同 ID 覆盖
- 缺失翻译时保留 base specialist，不让 specialist 消失
- Rust `/api/specialists` 与 TypeScript `/api/specialists` 对 locale 查询语义保持一致

## Reproduction Context

- Environment: desktop
- Trigger: 比对 #204 落地结果时，发现 Rust 侧虽然已经支持 taxonomy 目录和 YAML-only 资源，但 `/api/specialists?locale=zh-CN` 语义尚未补齐

## Why This Might Happen

- specialist taxonomy 迁移先解决了目录漂移与格式统一，后续没有继续把 Rust 的 runtime API 收敛到与 TypeScript 相同的 locale merge 层
- Rust 测试目前偏向“资源存在且结构正确”，尚未覆盖“base + overlay 的实际返回语义”

## Relevant Files

- `crates/routa-core/src/workflow/specialist.rs`
- `crates/routa-server/src/api/specialists.rs`
- `src/core/specialists/specialist-file-loader.ts`

## Observations

- TS 侧已经通过 `loadAllSpecialists(locale)` 将 bundled/user/base/locale overlay 合并成最终集合
- Rust 侧当前接口调用仍然是 `loader.load_default_dirs()`，没有 locale 参数

## References

- GitHub #204
- GitHub #233
