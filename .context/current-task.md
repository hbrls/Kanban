# Settings / Workspaces：新增与删除工作区方案

日期：2026-10-12。

状态：方案已整理，尚未实施。本次仅覆盖方案文档。

## 1. 目标与用户约束

在现有 `/settings/workspaces` 页面增加页头「新增工作区」按钮、名称输入弹窗、每行「删除」按钮和删除确认弹窗。

**用户明确要求：ID 为 `default` 的工作区不能删除，前端与后端均须保护。**

- 保护依据是 ID，不是名称、列表顺序、当前选择或仓库的 isDefault。
- default 改名或归档后仍不能删除。
- 普通 UUID 工作区即使名称为 Default Workspace 也可以删除。
- 普通 active 和 archived 工作区均允许删除。

沿用架构分工：Next.js 负责页面和交互，Rust 负责 JSON API，不新增 Next.js 工作区 JSON API route。前端使用 desktopAwareFetch，其内部调用 resolveApiPath。

保留现有四个数据列、全状态查询、创建时间倒序和独立仓库加载。不重新引入旧计划的六字段展示，不改 WorkspaceCards、工作区导航和重定向，不扩展搜索、分页、重命名、归档、恢复、仓库管理或完整资源清理。

## 2. 已有实现与接口

基线提交：`67e2f723c95e3d468188aaae830f55221c999888`（feat: Settings/Workspaces）。

| 操作 | 请求 | 当前行为 |
| --- | --- | --- |
| 全部列表 | `GET /api/workspaces` | 省略 status，返回 active 和 archived |
| 创建 | `POST /api/workspaces`，`{"title":"..."}` | trim 后名称不能为空；成功返回 201 和 `{ workspace }` |
| 删除 | `DELETE /api/workspaces/{id}` | 成功返回 200 和 `{ deleted: true }`，当前无 default 保护 |
| 仓库查询 | `GET /api/workspaces/{id}/codebases` | 各行独立请求 |

创建接口支持可选 metadata，本次仅提交 title。Rust 请求类型不包含 repoPath/branch，创建工作区不自动关联仓库。

已有 useWorkspaces({ status: "all" })；其中 createWorkspace(title) 成功后自动刷新列表，返回 WorkspaceData 或 null。HTTP 失败返回 null，网络及 JSON 解析异常可能抛出，弹窗须同时处理两种失败方式。

## 3. 页面布局

通过 SettingsPageHeader.extra 在标题右侧加入 Plus 图标及「新增工作区」按钮。表格末尾增加「操作」列：

```text
工作区                         [+ 新增工作区]  工作区: 3

名称              状态       关联仓库       metadata       操作
Default Workspace 活跃       ...            {}             删除（禁用）
Project A         活跃       frontend       {...}          删除
Project B         已归档     backend        {}             删除
```

- 删除按钮含 Trash 图标及文字，无障碍名称包含工作区名称。
- default 使用真正的 disabled 按钮，并显示「默认工作区不可删除」辅助文字；不能只依赖 disabled 按钮的悬停提示。
- 空列表及列表失败时仍保留新增入口；弹窗提交中禁用后台写操作入口。
- 描述改为「查看和管理所有工作区及其关联仓库」。
- 沿用 desktop 主题 token 和危险操作样式，所有 UI 文案接入中英文 i18n，不引入新 UI 库。

## 4. 新增工作区弹窗

同目录新增 create-workspace-dialog.tsx，内容包括标题「新增工作区」、名称输入框、「取消」和「创建」。

1. 打开后聚焦名称输入框，草稿与错误为空。
2. 使用 form 提交，Enter 提交，提交前 trim；空白名称禁用创建，提交函数再次校验。
3. 调用页面传入的 createWorkspace(title)，弹窗不另建 useWorkspaces 实例。
4. 提交中显示「创建中…」，禁用输入、提交和关闭；使用同步提交锁防止快速重复 POST。
5. 失败保留名称与弹窗，显示本地化错误，允许重试。
6. 成功关闭并重置弹窗，留在当前页面；刷新后新行按创建时间倒序展示，计数更新。
7. 取消、关闭和 Escape 不发送请求。

## 5. 删除确认弹窗

同目录新增 delete-workspace-dialog.tsx。行按钮传入 WorkspaceData，弹窗展示名称和 ID，避免同名混淆。

建议文案：

> 删除工作区「{title}」？
>
> 将永久删除该工作区及其任务、看板、笔记、会话记录、定时任务、产物、Agent 记录、技能绑定和仓库关联信息。此操作无法撤销。
>
> 本地仓库和工作树文件会保留；运行中的 Agent 不会自动停止。

按钮为「取消」和危险样式的「删除工作区」，不增加名称二次输入要求。

1. 行按钮仅打开弹窗，不立即请求 API。
2. 打开弹窗和确认提交的处理函数均检查 id === "default"，拒绝该目标，不发送 DELETE。
3. 初始焦点在取消按钮上，未提交时 Escape 可关闭。
4. 提交中显示「删除中…」，禁用关闭和重复提交，使用同步提交锁。
5. 失败保留弹窗和目标，显示本地化错误；409 映射为「默认工作区不可删除」。
6. 成功关闭弹窗、刷新列表及计数；列表为空时显示空状态。
7. 取消恢复原按钮焦点；成功删除后原行不存在，焦点回到新增按钮。

范围依据 .context/Workspace.md：数据库级联涉及 codebases、worktrees、acp_sessions、agents、tasks、artifacts、kanban_boards、notes、schedules、workspace_skills。当前不完整清理文件、运行时和无外键关联记录，因此不使用「清理所有资源」的承诺。

## 6. 状态组织与可访问性

页面管理列表编排和互斥的弹窗状态：

```ts
type WorkspaceDialogState =
  | { kind: "create" }
  | { kind: "delete"; workspace: WorkspaceData }
  | null;
```

- 表格接收 onDelete(workspace)，不直接调用 API。
- 弹窗放在列表 loading/error/empty 条件分支外，刷新列表不卸载进行中的弹窗。
- 弹窗管理草稿、pending、mutationError；hook 管理列表 loading/error，区分操作和加载错误。
- 使用原生 dialog 和 showModal，关联标题、说明与输入标签，使用浏览器提供的模态焦点约束。
- 处理 cancel 事件，提交中阻止 Escape 关闭；未提交时允许关闭。
- 错误提示使用 alert，关闭后管理焦点恢复。
- 真实浏览器验证模态焦点和桌面运行时；Vitest 必要时仅对 dialog API 做环境适配。

## 7. Hook 与刷新语义

在 UseWorkspacesReturn 中增加：

```ts
deleteWorkspace: (id: string) => Promise<void>;
```

请求：

```ts
desktopAwareFetch(`/api/workspaces/${encodeURIComponent(id)}`, {
  method: "DELETE",
});
```

方法在请求前拒绝 default；HTTP 非成功响应或成功响应缺少 deleted: true 时抛出可识别错误，供弹窗转换为本地化提示。成功后调用当前实例的 fetchWorkspaces，继承 all 查询语义。

复用现有 createWorkspace，成功响应先确认含有效工作区对象再刷新，保持原有返回工作区/null 的调用契约。

区分操作与刷新结果：

- POST/DELETE 失败：保留弹窗，允许重试操作。
- POST/DELETE 成功而后续 GET 失败：关闭弹窗，在列表区域显示加载错误和「重试加载」。
- 「重试加载」只调用 fetchWorkspaces，不重复 POST/DELETE。
- 不做乐观删除，避免失败时恢复行与仓库状态的复杂度。

## 8. Rust default 删除保护与 API 契约

在 crates/routa-core/src/store/workspace_store.rs 的 WorkspaceStore::delete 中，执行任何 SQL 前加入规则：

```rust
if id == "default" {
    return Err(ServerError::Conflict(
        "Default workspace cannot be deleted".to_string(),
    ));
}
```

规则位于已有 store 删除入口，使直接调用 store 的流程也无法绕过。Rust delete_workspace 继续传播错误，现有 ServerError 映射返回 HTTP 409：

```json
{"error":"Default workspace cannot be deleted"}
```

- 拒绝删除时工作区及子记录保持原样，不触发级联。
- 普通工作区保持 HTTP 200 和 { deleted: true }。
- 普通不存在 ID 保持当前幂等成功行为，不改成 404。
- 不修改 ensure_default 初始化、改名或归档规则。
- api-contract.yaml 的 DELETE /api/workspaces/{id} 补充 409 响应及错误结构。
- 实施前在 docs/fitness/rust-api-test.md 登记 default 拒绝删除条目，状态为 TODO；执行通过后才标记验证结果。

## 9. 计划修改文件

| 文件 | 改动 |
| --- | --- |
| src/app/settings/workspaces/page.tsx | 新增入口、弹窗状态、创建/删除编排、列表重试 |
| src/app/settings/workspaces/workspaces-table.tsx | 操作列、default 禁用删除及说明、onDelete |
| src/app/settings/workspaces/create-workspace-dialog.tsx | 新增表单与提交交互 |
| src/app/settings/workspaces/delete-workspace-dialog.tsx | 删除目标、影响说明及确认交互 |
| src/client/hooks/use-workspaces.ts | 删除方法、default 前置保护、必要的创建响应检查 |
| src/i18n/types-tail.ts | Settings 扩展文案类型 |
| src/i18n/locales/en-tail.ts、zh-tail.ts | 操作、进度、保护、错误文案及页面描述 |
| src/client/hooks/__tests__/use-workspaces.test.tsx | 创建/删除请求与保护、失败及刷新语义 |
| src/app/settings/workspaces/__tests__/page.test.tsx | 完整交互、default 保护及错误路径 |
| crates/routa-core/src/store/workspace_store.rs | default 保护及领域回归测试 |
| crates/routa-server/tests/rust_api_end_to_end.rs | HTTP 409 及持久化不变量测试 |
| api-contract.yaml | DELETE 工作区 409 响应契约 |
| docs/fitness/rust-api-test.md、unit-test.md | endpoint 与测试证据 |

不新增数据库表、字段或 endpoint。

## 10. 测试与验收

### 前端行为

1. 新增入口在正常、空列表和列表失败时可见。
2. 空白名称不能提交；有效名称 trim 后发送 POST。
3. 创建成功关闭弹窗，新行和计数更新；失败保留名称。
4. 快速重复提交仅发送一次 POST 或 DELETE。
5. 行删除打开正确目标；取消不发送请求。
6. 普通 active/archived 工作区删除成功移除对应行；失败保留行与弹窗。
7. default 禁用删除且不发送 DELETE，改名或归档仍受保护。
8. 普通 UUID 工作区即使名称为 Default Workspace 仍可删除。
9. 操作成功但刷新失败只展示列表错误，重试仅发送 GET。
10. Enter、Escape、焦点约束与焦点恢复符合设计。
11. 原有排序、全状态查询及单行仓库请求失败隔离继续通过。

### Rust 领域和 API

1. store 删除 default 返回 Conflict，工作区仍存在。
2. 为 default 准备至少一条子记录，拒绝删除后关键字段及数量不变，证明未触发级联。
3. DELETE /api/workspaces/default 返回 409，校验响应体；随后 GET 仍返回原工作区。
4. default 改名或归档后同样被拒绝。
5. 普通工作区删除返回 200 和 deleted: true，随后 GET 为 404；普通不存在 ID 保持幂等成功。
6. 同名普通工作区不受 default ID 保护影响。

### 验证流程

实施时先登记 API 行为变化与所需测试，再完成前后端实现。执行相关 Vitest、Rust store/API 测试、ESLint、TypeScript、API 契约检查及仓库要求的适用 fitness gates；未执行检查不得标为通过，按真实结果更新证据文档。

通过 Next.js 页面连接 Rust API 验证新增、取消、删除及 default 禁用提示，检查中英文、深浅色和窄窗口。手动截图等证据只放忽略的临时目录。

验收结果：Settings/Workspaces 可新增普通工作区、确认删除普通工作区，并且前端与 Rust 删除入口均保证 default 不可删除。
