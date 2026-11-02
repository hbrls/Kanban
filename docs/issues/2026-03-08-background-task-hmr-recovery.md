---
title: "Background Task stuck in RUNNING state after HMR and orphaned tasks"
date: "2026-03-08"
status: resolved
severity: high
area: "background-worker"
tags: ["background-task", "hmr", "polling", "acp"]
reported_by: "Augment Agent"
resolved_by: "Augment Agent (Claude Sonnet 4.5)"
resolved_at: "2026-03-08"
related_issues:
  - "2026-03-02-hmr-resets-session-to-task-map.md"
---

# Background Task 在 HMR 后卡在 RUNNING 状态及孤儿任务问题

## What Happened

在开发 BackgroundTask 系统时，发现以下问题：

1. **任务卡在 RUNNING 状态**：Next.js HMR 重启后，正在运行的任务无法被标记为 COMPLETED
2. **孤儿任务无法检测**：如果 `createAndSendPrompt()` 失败，任务状态为 RUNNING 但无 `resultSessionId`，永远卡住
3. **进度追踪缺失**：无法实时看到任务正在做什么

## Expected Behavior

- 任务应能在 HMR 重启后正确恢复状态
- 失败的任务应被检测并标记为 FAILED
- 用户应能实时看到任务进度（工具调用、当前活动）

## Reproduction Context

- Environment: web (Next.js development server with HMR)
- Trigger: 
  1. 创建 BackgroundTask 并开始执行
  2. 修改代码触发 HMR
  3. 观察任务状态卡在 RUNNING

## Why This Might Happen

### 问题 1: HMR 导致任务无法完成

- `checkCompletions()` 依赖内存 Map `sessionToTask` 来关联 session 和 task
- Next.js HMR 会重置所有内存状态
- 重启后，内存 Map 为空，即使 session 已完成，也无法找到对应的 task 来更新状态

### 问题 2: 孤儿任务无法被检测

- `dispatchTask()` 先乐观更新状态为 RUNNING
- 然后调用 `createAndSendPrompt()` 创建 session
- 如果创建失败（网络错误、配置错误等），任务状态已经是 RUNNING，但 `resultSessionId` 为 null
- 这些任务既不在 `listRunning()` 结果中（需要 sessionId），也不在 `listPending()` 中（需要 PENDING 状态）

## Relevant Files

- `src/core/background-worker/index.ts` - 任务调度器
- `src/core/store/background-task-store.ts` - 存储接口
- `src/core/db/pg-background-task-store.ts` - Postgres 实现
- `src/core/db/sqlite-stores.ts` - SQLite 实现
- `src/core/acp/http-session-store.ts` - 进度追踪

## Observations

服务器日志显示：
```
[BGWorker] Task 01693fbe-674a → session 55a49b5a-4a06
[AcpProcess:OpenCode] Notification: session/update (tool_call)
# HMR 触发，内存重置
[BGWorker] checkCompletions: 0 running tasks found (should be 1)
```

## Root Cause Analysis

1. **内存依赖问题**：`sessionToTask` Map 存储在内存中，HMR 后丢失
2. **乐观更新风险**：状态先更新为 RUNNING，如果后续失败无法回滚
3. **缺少数据库恢复机制**：没有从数据库恢复 RUNNING 任务的逻辑

## Resolution

### 解决方案 1: 数据库恢复机制

添加 `listRunning()` 方法到 BackgroundTaskStore，`checkCompletions()` 同时查询数据库和内存 Map：

```typescript
async checkCompletions(): Promise<void> {
  // Strategy 1: 检查内存 Map 中的任务
  for (const [sessionId, task] of this.sessionToTask.entries()) {
    const session = await this.getSession(sessionId);
    if (session?.status === 'completed' || session?.status === 'failed') {
      await this.markTaskComplete(task, session);
    }
  }
  
  // Strategy 2: 从数据库恢复 RUNNING 任务（HMR 恢复）
  const runningTasks = await system.backgroundTaskStore.listRunning();
  for (const task of runningTasks) {
    if (task.resultSessionId) {
      const session = await this.getSession(task.resultSessionId);
      if (session?.status === 'completed' || session?.status === 'failed') {
        await this.markTaskComplete(task, session);
      }
    }
  }
  
  // Strategy 3: 检测孤儿任务
  const orphaned = await system.backgroundTaskStore.listOrphaned(5);
  for (const task of orphaned) {
    await system.backgroundTaskStore.update(task.id, {
      status: 'FAILED',
      errorMessage: 'Orphaned task: dispatch failed without creating a session',
    });
  }
}
```

**相关 Commit:** `13cc317`, `034a946`

### 解决方案 2: 孤儿任务检测

添加 `listOrphaned(thresholdMinutes)` 方法：

```typescript
async listOrphaned(thresholdMinutes: number): Promise<BackgroundTask[]> {
  const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
  return db.query(`
    SELECT * FROM background_tasks
    WHERE status = 'RUNNING'
      AND result_session_id IS NULL
      AND started_at < $1
  `, [threshold]);
}
```

### 解决方案 3: 进度追踪

在 `http-session-store.ts` 中监听 ACP session 通知，实时更新任务进度：

```typescript
pushNotification(sessionId: string, notification: NormalizedSessionUpdate) {
  const task = this.sessionToTask.get(sessionId);
  if (task) {
    if (notification.type === 'tool_call') {
      task.toolCallCount = (task.toolCallCount || 0) + 1;
      task.currentActivity = `Running: ${notification.toolName}`;
    }
    task.lastActivity = new Date();
    await system.backgroundTaskStore.update(task.id, {
      lastActivity: task.lastActivity,
      currentActivity: task.currentActivity,
      toolCallCount: task.toolCallCount,
    });
  }
}
```

**相关 Commit:** `844ccb3`

## References

- 测试仓库：`phodal/data-mesh-spike`, `phodal/routa`
- 相关 API：`POST /api/background-tasks/process`, `POST /api/polling/check`

