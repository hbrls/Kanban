---
title: "[GitHub #78] feat: Workspace Repository Management UI & API"
date: "2026-03-07"
status: resolved
severity: medium
area: "github"
tags: ["github", "github-sync", "gh-78", "agent"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/78"]
github_issue: 78
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/78"
---

# [GitHub #78] feat: Workspace Repository Management UI & API

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #78
- URL: https://github.com/phodal/routa/issues/78
- State: closed
- Author: phodal
- Created At: 2026-03-07T16:35:26Z
- Updated At: 2026-03-07T16:35:26Z

## Labels

- `Agent`

## Original GitHub Body

## 概述

当前项目已有 `Codebase` 数据模型和后端存储层，支持将多个 Git 仓库关联到一个 Workspace。但缺少前端管理界面和部分 API 路由，用户无法通过 UI 添加、编辑、删除或切换 repository。

## 现状分析

### 已有的部分

- **数据模型** (`src/core/models/codebase.ts`): `Codebase` 接口，支持 `repoPath`、`branch`、`label`、`sourceType` (local/github)、`sourceUrl`、`isDefault`
- **数据库 Schema**: Postgres 和 SQLite 均有 `codebases` 表，外键关联 `workspaces`
- **后端 Store**: TypeScript (`PgCodebaseStore`) 和 Rust (`CodebaseStore`) 均有完整 CRUD + `setDefault` + `findByRepoPath`
- **API 路由**: `GET/POST /api/workspaces/[id]/codebases`
- **前端 Hook**: `useCodebases(workspaceId)` 仅支持 fetch

### 缺失的部分

#### 1. API 路由缺失
- 无 `PATCH /api/workspaces/[id]/codebases/[codebaseId]` — 编辑 codebase
- 无 `DELETE /api/workspaces/[id]/codebases/[codebaseId]` — 删除 codebase
- 无 `POST /api/workspaces/[id]/codebases/[codebaseId]/default` — 设置默认 codebase

#### 2. 前端 Hook 缺失
- `useCodebases` 缺少 `addCodebase`、`updateCodebase`、`removeCodebase`、`setDefaultCodebase` 方法

#### 3. UI 管理界面缺失
- Workspace 详情页没有 repository 管理区域
- 无添加/编辑/删除 repository 的交互
- 无设置默认 repository 的操作
- 无 repository 列表展示

#### 4. Rust 后端 API 对齐
- 确认 `crates/routa-server/src/api/codebases.rs` 是否已实现完整 CRUD 路由

## 为什么需要

- 一个 Workspace 可能对应多个微服务仓库，用户需要灵活管理
- Agent 执行任务时需要知道操作哪个 codebase，repository 管理是基础能力
- 当前只能通过 API 手动添加 codebase，缺乏可用性

---
Created by: Kiro AI (Claude Opus 4.6)
