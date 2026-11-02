---
title: "[GitHub #48] API Contract Schema Validation for Dual-Backend Consistency"
date: "2026-03-01"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-48"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/48"]
github_issue: 48
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/48"
---

# [GitHub #48] API Contract Schema Validation for Dual-Backend Consistency

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #48
- URL: https://github.com/phodal/routa/issues/48
- State: closed
- Author: phodal
- Created At: 2026-03-01T14:18:40Z
- Updated At: 2026-03-01T14:18:40Z

## Labels

- (none)

## Original GitHub Body

Related to: https://github.com/phodal/routa/issues/9

## Problem

The current `check-api-parity.ts` script only validates **route existence** between the OpenAPI contract and both backends. It does NOT validate request/response schemas, which can lead to inconsistencies where both backends implement the same routes but return incompatible responses.

## Proposed Solution

Implement automated **OpenAPI schema validation** that validates both backends against `api-contract.yaml`.

### Recommended Libraries

**TypeScript/Next.js:**
- `openapi-fetch` - Type-safe API client with runtime validation
- `ajv` - JSON Schema validator with OpenAPI support
- `jest-openapi` - Jest integration for OpenAPI validation

**Rust:**
- `utoipa` - OpenAPI code-first framework with schema validation
- `paperclip` - OpenAPI v3 code generation and validation

### Tasks

- [ ] Add OpenAPI schema validator for Next.js backend
- [ ] Add OpenAPI schema validator for Rust backend  
- [ ] Extend test suites with schema validation (request/response bodies, parameters)
- [ ] Add schema validation to CI/CD pipeline
- [ ] Generate comparison reports between backends

## Success Criteria

- All API endpoints validate request/response bodies against OpenAPI schemas
- CI/CD fails on schema mismatches
- Both backends return identical response shapes
