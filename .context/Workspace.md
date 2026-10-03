# Workspace：接口与 Settings 页面调研

记录日期：2026-10-12。

本文记录对 `67e2f723c95e3d468188aaae830f55221c999888`（`feat: Settings/Workspaces`）及当前 checkout 相关实现的静态代码调研。尚未实施创建、删除 UI，也未执行真实创建或删除请求。

## 1. Settings/Workspaces 当前行为

- 路由：`/settings/workspaces`。
- 展示所有工作区，包括 active 和 archived，按 `createdAt` 倒序排列；无法解析的日期按时间戳 0 处理。
- 表格字段：工作区名称、状态、关联仓库、metadata（JSON）。
- 每行通过 `useCodebases(workspaceId)` 独立请求关联仓库；默认仓库优先展示，并带默认标记。
- 某个工作区的仓库请求失败只影响该行，不阻断其他工作区展示。
- 当前页面为只读清单，没有创建或删除操作。
- 设置导航及页面文案已接入中英文 i18n。

相关文件：

- `src/app/settings/workspaces/page.tsx`
- `src/app/settings/workspaces/workspaces-table.tsx`
- `src/app/settings/workspaces/__tests__/page.test.tsx`
- `src/client/components/settings-center-nav.tsx`
- `src/client/hooks/use-workspaces.ts`

`useWorkspaces` 支持 `active | archived | all`，默认仍为 active。`all` 是前端筛选选项，实际请求省略 `status` 参数，不发送 `status=all`。Rust 后端在没有 status 参数时返回所有状态的工作区。

## 2. 创建接口

接口已存在：

```http
POST /api/workspaces
Content-Type: application/json

{"title":"My Workspace"}
```

当前 Rust 实现的请求字段：

| 字段 | 行为 |
| --- | --- |
| `title` | 必填；去除首尾空格后不得为空，否则返回 400，错误为 `title is required` |
| `metadata` | 可选，字符串键值对象；省略时保存为空对象 |

创建时生成 UUID，状态为 active，并设置创建、更新时间。保存成功返回 `201 Created`：

```json
{"workspace":{"id":"...","title":"My Workspace","status":"active","metadata":{},"createdAt":"...","updatedAt":"..."}}
```

该接口只创建工作区记录，没有创建或绑定仓库的步骤。`api-contract.yaml` 中还列有 `repoPath`、`branch`，但当前 Rust `CreateWorkspaceRequest` 只声明 title 和 metadata，不应据契约推断创建接口会关联仓库。

实现位置：

- `crates/routa-server/src/api/workspaces.rs`：路由注册、`CreateWorkspaceRequest`、`create_workspace`。
- `crates/routa-core/src/models/workspace.rs`：`Workspace::new`。
- `src/client/hooks/use-workspaces.ts`：已有 `createWorkspace(title)`。

现有前端方法通过 `desktopAwareFetch` 发送 POST，成功解析后调用 `fetchWorkspaces()` 刷新列表，返回 `WorkspaceData | null`。HTTP 非成功响应返回 null；网络异常或 JSON 解析异常可能抛出。列表刷新有独立的 loading/error 状态，即使刷新失败，创建方法仍可能返回已创建的工作区。

### 建议的创建 UI 方案（尚未实施）

1. 使用 `SettingsPageHeader` 已有的 `extra` 插槽，在标题右侧加入「新建工作区」按钮。
2. 同目录新增 `create-workspace-dialog.tsx`，首版仅填写工作区名称，提供取消和创建按钮。
3. 提交前 trim；空白名称不能提交。提交中显示进度并阻止重复提交。
4. 打开后聚焦输入框；支持 Enter 提交、Escape 关闭，管理弹窗内焦点并在关闭后恢复触发按钮焦点。
5. 复用页面当前 `useWorkspaces({ status: "all" })` 的创建方法，避免为弹窗再实例化独立的列表 hook。
6. 成功后关闭并清空弹窗，留在当前设置页；刷新后新记录按创建时间排序展示，计数同步更新。
7. 同时处理返回 null 与抛出异常；失败时保留名称和弹窗，显示本地化错误。创建成功但列表刷新失败，应展示列表错误，避免引导用户重复创建。
8. 补齐中英文文案，调整当前页面「只读查看」的描述。
9. 扩展行为测试：空名称、trim、创建成功和列表刷新、失败保留输入、重复提交、取消及键盘操作；同步维护相应测试证据。

## 3. 删除接口

接口已存在：

```http
DELETE /api/workspaces/{id}
```

成功返回 HTTP 200：

```json
{"deleted":true}
```

调用链：

```text
delete_workspace
  → workspace_store.delete(id)
  → DELETE FROM workspaces WHERE id = ?1
  → SQLite 外键级联删除
```

实现位置：

- `crates/routa-server/src/api/workspaces.rs`：`delete_workspace`。
- `crates/routa-core/src/store/workspace_store.rs`：`WorkspaceStore::delete`。

当前限制：

- 不先检查工作区是否存在，也不检查 SQL 受影响行数；不存在的 ID 也返回成功。
- 没有默认工作区删除保护。
- 没有运行中 Agent、会话或任务的删除保护。
- 没有停止运行进程、清理内存队列或删除文件系统资源的步骤。
- `useWorkspaces` 尚未封装 `deleteWorkspace` 方法。

若后续增加删除 UI，可在表格增加操作列和确认弹窗，成功后刷新列表。确认文案应准确描述下述删除范围。

## 4. 级联删除范围

依据 `crates/routa-core/src/db/mod.rs` 当前建表定义。数据库连接开启了 `PRAGMA foreign_keys=ON`；以下 10 张表通过 `workspace_id REFERENCES workspaces(id) ON DELETE CASCADE` 关联工作区：

| 表 | 删除内容 |
| --- | --- |
| `codebases` | 关联仓库的登记信息（路径、分支、标签等） |
| `worktrees` | 工作树登记信息 |
| `acp_sessions` | 会话记录，包括其中内嵌的 `message_history` |
| `agents` | 工作区内的 Agent 记录 |
| `tasks` | 任务及其内嵌的会话、交接、验证等数据 |
| `artifacts` | 产物记录 |
| `kanban_boards` | 看板及其内嵌的列配置 |
| `notes` | 笔记 |
| `schedules` | 定时任务配置 |
| `workspace_skills` | 工作区与技能的绑定关系 |

另有两条间接级联路径：

- `codebases → worktrees`：`worktrees.codebase_id` 带 ON DELETE CASCADE。
- `tasks → artifacts`：`artifacts.task_id` 带 ON DELETE CASCADE。

以上为代码定义的范围，未检查用户现有数据库的实际 schema，也未执行级联删除验证。

### 不会由该接口自动清理的内容

| 内容 | 原因或当前行为 |
| --- | --- |
| `skills` 本体 | 删除的是 workspace_skills 绑定，不会反向删除技能 |
| `messages` | agent_id 没有到 agents 的外键，可能留下孤立消息 |
| `event_subscriptions` | agent_id 没有到 agents 的外键，可能留下孤立订阅 |
| `pending_events` | workspace_id、agent_id 未定义相应外键，可能留下孤立事件 |
| 仓库目录、Git worktree 目录和分支 | 删除处理只操作数据库，没有调用文件系统或 Git 清理 |
| JSONL trace 等文件 | 删除处理没有 trace 文件清理步骤 |
| 运行中的 Agent、会话、内存队列 | 删除处理没有运行时停止或清理调用 |

结论：现有删除接口完成数据库层面的级联删除，尚不构成完整的工作区资源清理。

## 5. 后端访问前提

当前 checkout 中不存在 `src/app/api/workspaces/route.ts`；已确认的工作区创建、删除 HTTP 实现在 Rust 后端。浏览器访问依赖配置的后端地址或 `next.config.ts` 中由 `ROUTA_RUST_BACKEND_URL` 启用的 API rewrite。

前端应沿用 `desktopAwareFetch`；其内部调用 `resolveApiPath`，同时处理配置的后端地址和桌面静态运行时回退，不直接新增 `fetch('/api/...')`。
