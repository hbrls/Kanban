---
title: Next.js CI tests fail with PostgreSQL role error
date: 2026-03-02
status: resolved
severity: medium
area: ci/cd
reported_by: Augment
---

## What Happened

The Next.js runtime schema validation tests in GitHub Actions CI are failing with 500 errors on all POST/GET endpoints. The test results show:

```
❌ Schema: POST /api/workspaces — response matches contract (24ms)
   → Assertion failed: Expected 200/201, got 500
❌ Schema: GET /api/workspaces — response matches contract (8ms)
   → Assertion failed: Expected status 200, got 500
```

8 out of 31 tests are failing with the same pattern.

The PostgreSQL container logs show repeated connection errors:

```
FATAL:  role "root" does not exist
```

This error appears multiple times throughout the test execution, indicating that the Next.js application is attempting to connect to PostgreSQL using the username "root", but the PostgreSQL container is configured with the username "routa".

## Why This Might Happen

可能的原因包括：

1. **DATABASE_URL 解析问题**: Next.js 应用可能在某些情况下没有正确解析 `DATABASE_URL` 环境变量，导致使用了默认的 "root" 用户名而不是配置的 "routa" 用户名。

2. **环境变量传递问题**: 虽然工作流中已经设置了 `DATABASE_URL` 环境变量，但可能在某些步骤中没有正确传递到 Next.js 运行时。

3. **Drizzle ORM 配置问题**: `drizzle.config.ts` 或数据库连接代码可能在某些情况下使用了硬编码的连接参数或默认值。

4. **NODE_ENV=test 影响**: 设置 `NODE_ENV=test` 可能触发了不同的数据库连接逻辑或配置路径。

## Relevant Files

- `.github/workflows/api-schema-validation.yml` (lines 119-129) - DATABASE_URL 环境变量配置
- `drizzle.config.ts` - Drizzle ORM 配置
- `lib/db.ts` 或类似的数据库连接文件
- `tests/api-contract/test-schema-validation.ts` - 失败的测试

## Context

- Workflow run: #8 (ID: 22570812284)
- Job: Runtime Schema Validation — Next.js (ID: 65378155123)
- PostgreSQL container configuration:
  - POSTGRES_USER: routa
  - POSTGRES_PASSWORD: routa_test
  - POSTGRES_DB: routa_test
- Expected DATABASE_URL: `postgresql://routa:routa_test@localhost:5432/routa_test`

## Related

- Rust backend tests pass successfully with the same test suite
- Static schema validation passes
- The issue only affects Next.js runtime tests in CI

## Resolution

Resolved as part of later CI and database-runtime cleanup.

Evidence that the original failure mode is no longer the active path:

- The old workflow file `.github/workflows/api-schema-validation.yml` referenced by this issue no longer exists.
- The repository now uses `.github/workflows/defense.yaml` as the main validation pipeline instead of the removed schema-validation workflow.
- `src/core/db/index.ts` now has explicit runtime/driver selection and a dedicated standard Postgres path for CI/local TCP databases, instead of relying on the earlier ambiguous connection behavior.

This means the specific broken CI path documented here has been retired rather than left in place.
