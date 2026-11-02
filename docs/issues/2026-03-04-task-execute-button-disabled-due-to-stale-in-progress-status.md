---
title: "Task Execute button disabled due to stale IN_PROGRESS status"
date: "2026-03-04"
status: resolved
severity: medium
area: ui
tags: [collaborative-tasks, task-execution, state-management]
reported_by: "kiro"
related_issues: []
---

# Task Execute button remains disabled when another task is stuck in IN_PROGRESS state

## What Happened

在 Collaborative Tasks 面板中，当用户将任务状态从 "Failed" 改为 "Pending" 后，Execute 按钮仍然是灰色（disabled）状态，无法点击执行。

通过 Playwright 浏览器测试发现：
1. 访问 session 页面 `/workspace/default/sessions/5f7d2bba-71d1-4be0-8895-f6f9158f2229`
2. 右侧 Collaborative Tasks 面板显示 "Executing..." 状态
3. 任务 #1 "Review and Verify PR #58" 状态改为 "Pending" 后，Execute 按钮显示为 disabled
4. 通过 API 查询 `/api/notes` 发现任务 "task-997e68c3" (PR #61) 的 taskStatus 为 "IN_PROGRESS"

## Expected Behavior

当任务状态为 "Pending" 时，如果并发度允许（concurrency > 1 或没有其他任务正在运行），Execute 按钮应该是可点击的。

## Reproduction Context

- Environment: web
- Trigger: 
  1. 有一个任务处于 "IN_PROGRESS" 状态（可能是之前执行失败或中断导致）
  2. 并发度设置为 1
  3. 尝试执行另一个 "Pending" 状态的任务

## Why This Might Happen

- 可能是任务执行过程中发生错误或中断，但状态没有正确更新为 "FAILED" 或 "COMPLETED"
- 可能是 ACP 连接断开或 agent 进程异常退出，导致任务状态没有收到最终的完成通知
- 可能是前端状态同步机制存在问题，任务实际已完成但前端没有收到更新
- 疑似缺少任务状态的超时或清理机制，导致"僵尸"任务一直占用执行槽位

## Relevant Files

- `src/client/components/collaborative-task-editor.tsx` - Execute 按钮的禁用逻辑 (line 374: `executeDisabled={concurrency <= 1 && hasRunning}`)
- `src/client/components/collaborative-task-editor.tsx` - hasRunning 的定义 (line 138: `const hasRunning = taskNotes.some((n) => n.metadata.taskStatus === "IN_PROGRESS")`)
- `src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx` - 任务执行和状态更新逻辑
- `src/app/api/notes/route.ts` - Notes API，任务状态持久化

## Observations

API 返回的任务数据：
```json
{
  "id": "task-997e68c3",
  "title": "Review and Verify PR #61: Custom ACP Provider",
  "metadata": {
    "type": "task",
    "taskStatus": "IN_PROGRESS",
    ...
  },
  "updatedAt": "2026-03-04T02:30:37.649Z"
}
```

前端逻辑：
- Execute 按钮禁用条件：`concurrency <= 1 && hasRunning`
- `hasRunning` 检查：`taskNotes.some((n) => n.metadata.taskStatus === "IN_PROGRESS")`
- 当并发度为 1 且存在 IN_PROGRESS 任务时，所有其他 Pending 任务的 Execute 按钮都会被禁用

## References

- Screenshot: `task-status-changed-to-pending.png` - 显示 Execute 按钮被禁用的状态

## Resolution

Resolved by later session-task state synchronization work.

Evidence in current implementation:

- `src/app/workspace/[workspaceId]/sessions/[sessionId]/use-session-crafters.ts` now continuously syncs task-note status from crafter agent status.
- The same module also contains a stale-task recovery effect that scans `IN_PROGRESS` task notes and resets them to `COMPLETED`, `FAILED`, or `PENDING` when no matching running crafter exists.
- `src/client/components/collaborative-task-editor.tsx` now derives `hasRunning` from both task-note status and live crafter state, so the disabled state is tied to actual running work rather than only a stuck persisted note.

This directly addresses the zombie `IN_PROGRESS` condition described in the original report.
