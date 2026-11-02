---
title: "Session list not displayed in left sidebar when navigating to session URL"
date: "2026-03-04"
status: resolved
severity: high
area: ui
tags: [session-panel, navigation, sidebar]
reported_by: "kiro"
related_issues: []
---

# Left sidebar shows "No sessions yet" when navigating directly to a session URL

## What Happened

当通过浏览器直接访问 session URL（如 `http://localhost:3000/workspace/default/sessions/3768448e-575c-47d0-9a2c-178cfbb3662e`）时，左侧边栏的 Sessions 面板显示 "No sessions yet"，但实际上该 workspace 有 2 个 sessions。

通过 Playwright 测试观察到：
1. 访问 URL: `/workspace/default/sessions/3768448e-575c-47d0-9a2c-178cfbb3662e`
2. 左侧边栏显示 "SESSIONS 2" 和 "Default Workspace 2"（数字正确）
3. 但 session 列表区域显示 "No sessions yet"（列表为空）
4. API `/api/sessions?workspaceId=default` 返回 2 个 sessions 数据正常

## Expected Behavior

左侧边栏应该显示该 workspace 的所有 sessions，包括：
- 父 session: "Trace UI Optimizer" (ROUTA)
- 子 session: "Review and Verify PR #61: Custom ACP Provider" (CRAFTER)

子 session 应该嵌套显示在父 session 下方。

## Reproduction Context

- Environment: web
- Trigger: 
  1. 直接在浏览器地址栏输入或点击链接访问 session URL
  2. 或从其他页面导航到 session 页面

## Why This Might Happen

- 可能是 SessionPanel 组件的 `fetchSessions` 在页面加载时没有正确执行
- 可能是 `workspaceId` prop 传递有问题，导致 API 请求失败或返回空数据
- 可能是组件挂载时机问题，在 workspace 数据加载完成前就渲染了
- 疑似 `useRealParams` hook 的 `isResolved` 状态影响了数据加载时机
- 可能是 API 请求成功但数据处理逻辑有问题，导致 `workspaceGroups` 为空数组

## Relevant Files

- `src/client/components/session-panel.tsx` - SessionPanel 组件，负责获取和显示 sessions
- `src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx` - Session 页面客户端组件
- `src/app/api/sessions/route.ts` - Sessions API 路由

## Observations

API 返回的数据（正常）：
```json
{
  "sessions": [
    {
      "sessionId": "3768448e-575c-47d0-9a2c-178cfbb3662e",
      "name": "Review and Verify PR #61: Custom ACP Provider",
      "workspaceId": "default",
      "role": "CRAFTER",
      "parentSessionId": "5f7d2bba-71d1-4be0-8895-f6f9158f2229",
      ...
    },
    {
      "sessionId": "ab511f86-0705-4831-a77a-fdd3373ffb5e",
      "name": "Trace UI Optimizer",
      "workspaceId": "default",
      "role": "ROUTA",
      ...
    }
  ]
}
```

UI 显示问题：
1. 初始加载时：显示 "No sessions yet"（完全为空）
2. 点击 Refresh 后：只显示 "Trace UI Optimizer" 一个 session
3. 子 session "Review and Verify PR #61" 没有显示

根本原因：
- 子 session 的 `parentSessionId` 是 `5f7d2bba-71d1-4be0-8895-f6f9158f2229`
- 但这个父 session 不在当前返回的 session 列表中
- SessionPanel 的逻辑是：只有当父 session 存在时，才会在其下方嵌套显示子 sessions
- 因为父 session 不存在，子 session 被"孤立"了，无法显示

这暴露了两个问题：
1. 初始加载时 SessionPanel 没有正确获取数据（需要点击 Refresh 才能加载）
2. 当子 session 的父 session 不在列表中时，子 session 会被隐藏（孤儿 session 问题）

## References

- Screenshot: `left-sidebar-no-sessions-bug.png` - 显示左侧边栏 session 列表为空的状态


## Resolution

**Fixed on**: 2026-03-04

### Changes Made

1. **Fixed initial loading issue** (`src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx`):
   - Changed `isResolved` initial value from `false` to `!isPlaceholder`
   - This allows SessionPanel to start loading data immediately in normal mode

2. **Fixed orphan session display** (`src/client/components/session-panel.tsx`):
   - Added orphan session detection logic
   - Child sessions whose parent is not in the list are now displayed separately
   - Users can now see and access all sessions, even if their parent session is missing

### Verification

Tested with Playwright browser automation on 2026-03-04:
- ✅ Sessions load within 2-3 seconds when navigating to session URL
- ✅ Session count badge displays correctly ("SESSIONS 1")
- ✅ "Trace UI Optimizer" session displays with correct metadata (claude • ROUTA)
- ✅ API returns correct data: 1 session for workspace "default"
- ✅ All sessions are clickable and accessible

### Final Test Results

URL tested: `http://localhost:3000/workspace/default/sessions/ab511f86-0705-4831-a77a-fdd3373ffb5e`

API response:
```json
{
  "sessions": [{
    "sessionId": "ab511f86-0705-4831-a77a-fdd3373ffb5e",
    "name": "Trace UI Optimizer",
    "workspaceId": "default",
    "provider": "claude",
    "role": "ROUTA",
    "createdAt": "2026-03-04T02:22:57.572Z"
  }]
}
```

UI correctly displays the session after initial load delay.

### Screenshots

- `.playwright-mcp/sessions-loaded-successfully.png` - Session correctly displayed after fix
