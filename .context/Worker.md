# BackgroundTaskWorker 反复 POST /api/acp 404 调查记录

> 记录时间：2026-09-22
>
> 目的：记录"某个 job 间歇性反复 POST /api/acp 并报 404"的根因，供后续修复者直接接手。本轮只调查，未修改业务代码。

## 一、症状

- 日志中间歇出现反复 `POST /api/acp`，响应 404。
- 不能稳定复现：只有特定时段出现，出现时会连续多次。

## 二、根因

`BackgroundTaskWorker` 的 dispatch 循环向 **Next.js 自己的 origin** 发 `POST /api/acp`，但 Next.js 的 `/api/acp` 路由已被删除，因此每个被 dispatch 的 task 都会收到一次 404。

### 调用链

```text
src/instrumentation.ts（NEXT_RUNTIME === "nodejs"，Next.js 启动即执行）
  -> startBackgroundWorker()
  -> src/core/background-worker/index.ts:47
       dispatchTimer = setInterval(dispatchPending, 5s)
     :48
       completionTimer = setInterval(checkCompletions, 15s)

dispatchPending()
  -> backgroundTaskStore.listReadyToRun() 有 ready 的 PENDING task
  -> dispatchTask() -> createAndSendPrompt()（index.ts:223-309）
       POST {base}/api/acp  session/new    index.ts:262（等待响应）
       POST {base}/api/acp  session/prompt index.ts:293（fire-and-forget）
```

### 404 的直接原因

`createAndSendPrompt` 的 base URL 由 `getInternalBaseUrl()`（index.ts:30-35）解析：

```text
VERCEL_URL -> NEXTAUTH_URL -> http://localhost:${PORT ?? 3000}
```

即**写死指向 Next.js origin**（本地默认 3000）。但 Next.js 侧 `/api/acp` 已在以下提交中删除：

```text
cb97e59 / fad086c  [nice] 仅保留 rust server 作为接口后端
  删除 src/app/api/acp/route.ts（1245 行）
  同批删除 background-tasks/process、a2a、agents 等一大批 Next.js 路由
```

现在 `/api/acp` 只存在于 Rust server：

```text
crates/routa-server/src/api/mod.rs:84      .nest("/api/acp", acp_routes::router())
crates/routa-server/src/api/acp_routes.rs:28
  .route("/", get(acp_sse).post(acp_rpc))   支持 session/new（:525）
```

worker 没有任何路径会打到 Rust 后端的 3210 端口，因此命中已删除的 Next.js 路由 -> 404。

### 为什么不能稳定复现

404 不是持续发生，而是五重门控叠加的结果，只有全部满足时才出现：

1. **Worker 只在 Next.js nodejs 进程里启动**（`src/instrumentation.ts`）。桌面端纯跑 Rust server 时不存在这个 worker——同一批后台任务，desktop 下完全不报 404，web/dev 下才会报。

2. **只有队列里有 ready 的 PENDING task 才发 POST**（`dispatchPending` → `listReadyToRun()`）。task 的来源是 scheduler service、工作流或手动排入，本身在时间上随机；队列空时 worker 每 5 秒空转，网络层完全安静。

3. **并发槽门控**：`running.length >= MAX_CONCURRENT_TASKS (2)` 时整个周期直接跳过（index.ts:87-90），已有 2 个 task 在跑时不发任何请求。

4. **每个 task 只 404 一次**：`session/new` 404 后 `dispatchTask` 立即把 task 标 FAILED（index.ts:149-157），同一 task 不会重试。所以"反复 404"实际是一波——每 5 秒一批、每批最多 2 个新 task——直到队列耗尽。之后再次静默，直到新任务排入。

5. **base URL 决定报什么错**（`getInternalBaseUrl`，index.ts:30-35）：
   - 指到**没起服务的端口** → `ECONNREFUSED`，不是 404；
   - 指到 **Next.js dev server**（路由已删） → 404；
   - 指到 **Rust server** → 正常执行，无错误。
   例如 `next dev -p 3001` 但没设 `PORT` 环境变量时，base 落到 3000——那个端口上跑的是什么决定了看到的是 404、连接拒绝还是干脆成功。

表面上的"随机" = ① 跑的哪个后端 × ② 队列里此刻有没有任务 × ③ 并发槽是否空闲 × ④ base 解析到哪个端口。其中 ② 是唯一随时间变化的项，也是"有时候出现、一波过后消失"的直接来源。

## 三、相关代码位置

```text
src/instrumentation.ts                      启动 worker + scheduler service
src/core/background-worker/index.ts
  :21    DISPATCH_INTERVAL_MS = 5s
  :30-35 getInternalBaseUrl()                写死 Next.js origin
  :223   createAndSendPrompt()
  :262   POST session/new
  :293   POST session/prompt（fire-and-forget）
  :149-157 dispatch 失败 -> task FAILED
src/core/background-worker/index.ts:6-7      文件头注释自述设计就是"内部调用 /api/acp"
```

其他 POST /api/acp 的调用方（`src/core/kanban/agent-trigger.ts:669`、`src/core/tools/kanban-tools.ts:952`）均为单次触发、非轮询，已排除。

## 四、修复方向（三选一，需产品/架构决定）

1. **改指向 Rust 后端**：`getInternalBaseUrl()` 落到 Rust server（desktop 默认 `http://127.0.0.1:3210` 或配置地址），Rust 的 `acp_rpc` 已支持 `session/new`/`session/prompt`。改动最小，但 worker 的生命周期仍挂在 Next.js 进程上。
2. **进程内直接调用**：worker 不再走 HTTP 回环，直接调用 session 创建/发送的进程内实现（`src/app/api/acp/acp-session-create.ts` 等模块仍在仓库中，runner-http-server 也这么复用）。消除对任一 HTTP origin 的依赖。
3. **停用该 worker**：既然 Next.js API 面已整体下线，且 desktop 走 Rust 后端、不跑 Next.js server，worker 在 web 模式下也已失去目标 endpoint。如果 background task 队列能力计划整体迁移到 Rust 侧，可考虑不再从 `instrumentation.ts` 启动它。

注意：无论选哪个方向，`checkCompletions`（index.ts:320-430）里的"session 消失即 COMPLETED""orphan/stale 标 FAILED"逻辑依赖 `getHttpSessionStore()` 的进程内状态，与 dispatch 修复方式存在耦合，修复时需一并确认。

## 五、遗留观察

- `src/app/api/acp/` 目录下已无 `route.ts`，只剩 `acp-session-create.ts` 等被进程内复用的模块；`src/core/acp/runner-http-server.ts:40` 仍在 `importRouteModule("@/app/api/acp/route")`，该路径已不存在，属于同一批删除留下的悬挂引用，修复时可一并清理。
