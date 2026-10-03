---
dimension: ui_consistency
weight: 0
tier: deep
threshold:
  pass: 80
  warn: 70

metrics:
  - name: web_main_journey_e2e
    command: "playwright test e2e/homepage-open-board-tauri.spec.ts e2e/repo-picker.spec.ts e2e/specialist-selection.spec.ts e2e/session-layout-ux.spec.ts e2e/agent-trace.spec.ts 2>&1"
    pattern: "\\d+\\s+passed"
    hard_gate: false
    tier: deep
    execution_scope: ci
    gate: advisory
    kind: holistic
    analysis: dynamic
    stability: noisy
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/app/**
      - src/client/**
      - e2e/**
      - playwright*.ts
    description: "首页 -> repo/provider/specialist -> session -> trace 的 Web 主链路回归"

  - name: web_kanban_journey_e2e
    command: "playwright test e2e/kanban-drag-drop.spec.ts e2e/kanban-agent-panel.spec.ts e2e/kanban-column-automation.spec.ts e2e/kanban-opencode-smoke.spec.ts e2e/kanban-workspace-events.spec.ts 2>&1"
    pattern: "\\d+\\s+passed"
    hard_gate: false
    tier: deep
    execution_scope: ci
    gate: advisory
    kind: holistic
    analysis: dynamic
    stability: noisy
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/app/workspace/**
      - src/client/components/kanban/**
      - crates/routa-server/**
      - e2e/**
      - playwright*.ts
    description: "Kanban 建卡、列流转、列自动化与 workspace 事件同步回归"

  - name: web_settings_protocol_regression
    command: "playwright test e2e/provider-changes.spec.ts e2e/acp-provider-switching.spec.ts e2e/install-agents-check.spec.ts e2e/install-agents-modal.spec.ts e2e/custom-mcp-servers.spec.ts e2e/a2a-protocol.spec.ts e2e/ag-ui-protocol.spec.ts e2e/mcp-tools.spec.ts e2e/mcp-integration.spec.ts 2>&1"
    pattern: "\\d+\\s+passed"
    hard_gate: false
    tier: deep
    execution_scope: ci
    gate: advisory
    kind: holistic
    analysis: dynamic
    stability: noisy
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/app/settings/**
      - src/app/a2a/**
      - src/app/ag-ui/**
      - src/app/mcp-tools/**
      - src/client/components/settings/**
      - e2e/**
      - playwright*.ts
    description: "Settings、Agent/MCP 安装、自定义 MCP，以及协议测试页的 Web 回归"

  - name: web_accessibility_smoke
    command: npm run test:accessibility 2>&1
    pattern: "accessibility smoke passed"
    hard_gate: false
    tier: deep
    execution_scope: ci
    gate: advisory
    kind: holistic
    analysis: dynamic
    stability: noisy
    evidence_type: test
    scope: [web]
    run_when_changed:
      - src/app/**
      - src/client/**
      - scripts/fitness/check-accessibility-smoke.mjs
      - e2e/**
    description: "关键 Web 页面保留基本 aria 结构与交互可访问性 smoke"
---

# Web QA / E2E 测试矩阵

面向 Routa.js Web 端主链路的 QA 回归清单。目标不是替代单元测试，而是把“按产品功能组织的人工验证”与“现有/推荐的 e2e 自动化”对应起来，方便回归、提测和补齐覆盖。

功能入口以 [docs/product-specs/FEATURE_TREE.md](../product-specs/FEATURE_TREE.md) 为准；如果页面路由或 API 面发生变化，先更新 feature tree，再审查本文件里的场景是否仍然成立。

## 适用范围

- 首页与工作区入口
- Session 详情页与 Trace 视图
- Kanban 看板与自动化流转
- Provider / Specialist / Repo 选择
- 设置页与协议测试页

## 执行前置

```bash
npm run dev
```

可选自动化：

```bash
npm run test:e2e
npm run test:accessibility
```

如果改动涉及 `FEATURE_TREE.md` 对应的页面或 API：

```bash
node --import tsx scripts/docs/feature-tree-generator.ts --save
```

## 核心回归矩阵

| ID | 功能 | 手工 QA 场景 | 预期结果 | 自动化映射 |
|---|---|---|---|---|
| QA-HOME-001 | 首页加载 | 打开 `/`，确认 workspace、settings、通知、主输入区渲染完成 | 首页可用；存在工作区入口、`HomeInput`、Open Kanban CTA | `e2e/homepage-open-board-tauri.spec.ts` |
| QA-HOME-002 | 工作区切换 | 在首页切换 workspace，再点击 `Workspace overview` / `Open Kanban` | 跳转到当前激活 workspace 对应页面，不串 workspace | 手工为主 |
| QA-HOME-003 | Provider / Repo 选择 | 在首页选择 repo、分支、provider 后提交问题 | 输入可提交；repo 信息进入 session 上下文；成功跳转到 session 页 | `e2e/repo-picker.spec.ts` |
| QA-HOME-004 | Specialist 选择 | 在首页选择自定义 specialist，再清除 | specialist pill、模式提示、角色切换器显隐正确 | `e2e/specialist-selection.spec.ts` |
| QA-SESSION-001 | Session 详情页布局 | 打开 `/workspace/:workspaceId/sessions/:sessionId`，检查桌面端与移动端布局 | 左侧 session/sidebar、任务快照、主聊天区布局稳定；移动端抽屉正常 | `e2e/session-layout-ux.spec.ts` |
| QA-SESSION-002 | Session 新建与续聊 | 在 session 页切换 agent/provider/repo 后发送输入 | 可创建新 session 或复用目标 session；聊天输入不丢失上下文 | `src/app/workspace/[workspaceId]/sessions/[sessionId]/__tests__/session-page-client.test.tsx` |
| QA-TRACE-001 | Trace 记录与查询 | 发送一次触发工具调用的消息，再打开 trace 数据或 `/traces` | 可查到 session trace；包含消息、工具调用或生命周期事件 | `e2e/agent-trace.spec.ts` |
| QA-KANBAN-001 | 手工建卡 | 打开 `/workspace/:workspaceId/kanban`，通过 Manual/Create issue 建卡 | 卡片创建成功，出现在目标列，标题和 objective 正确 | `e2e/kanban-drag-drop.spec.ts`、`e2e/kanban-agent-panel.spec.ts` |
| QA-KANBAN-002 | 列流转 | 拖拽卡片或通过 API/界面移动到新列 | 卡片列、位置、状态一致；刷新后仍保持 | `e2e/kanban-drag-drop.spec.ts` |
| QA-KANBAN-003 | 列自动化 | 打开列自动化，将卡片移入 `Todo` / `Dev` 这类自动化列 | 任务写入 `assignedProvider`、`assignedRole`、`triggerSessionId`；UI 出现 Live/Starting/Failed/Idle 等状态 | `e2e/kanban-column-automation.spec.ts`、`e2e/kanban-opencode-smoke.spec.ts` |
| QA-KANBAN-004 | 工作区事件同步 | 在 Kanban 内新建或更新卡片，观察同 workspace 数据刷新 | SSE/轮询同步正常，页面无需手刷即可反映变化 | `e2e/kanban-workspace-events.spec.ts` |
| QA-SETTINGS-001 | Provider 设置 | 打开 `/settings`，切换 provider 或模型配置 | 默认 provider 可保存；首页/会话页可读取更新后的配置 | `e2e/provider-changes.spec.ts`、`e2e/acp-provider-switching.spec.ts` |
| QA-SETTINGS-002 | Agent 安装与自定义 MCP | 打开 `/settings/agents` 或相关安装入口，执行安装/校验 | 安装结果、错误提示、刷新后状态一致 | `e2e/install-agents-check.spec.ts`、`e2e/install-agents-modal.spec.ts`、`e2e/custom-mcp-servers.spec.ts` |
| QA-PROTOCOL-001 | 协议测试页 | 打开 `/a2a`、`/ag-ui`、`/mcp-tools` | 页面可加载，核心交互控件存在，协议请求结果可见 | `e2e/a2a-protocol.spec.ts`、`e2e/ag-ui-protocol.spec.ts`、`e2e/mcp-tools.spec.ts`、`e2e/mcp-integration.spec.ts` |
| QA-MESSAGES-001 | 消息与通知 | 打开 `/messages`，触发一条可见通知或历史记录 | 消息列表、筛选和历史展示可用 | 手工为主 |

## 建议提测顺序

1. 跑页面入口与静态能力：`/`、`/settings`、`/messages`、`/traces`
2. 跑主链路：首页选 workspace/repo/provider -> 创建 session -> 进入 session 页
3. 跑协作链路：Kanban 建卡 -> 列流转 -> 自动化触发 session
4. 跑协议与扩展能力：A2A、AG-UI、MCP Tools、自定义 MCP、Agents 安装

## 缺口与补测建议

- 首页“切换 workspace 后 CTA 跳转保持一致”的场景目前主要靠人工验证，适合补一个轻量级 e2e smoke。
- `/messages` 目前缺少明确的 Playwright 回归用例，建议后续补页面加载和筛选 smoke。
- `FEATURE_TREE.md` 是页面/API 面的基线索引，不覆盖页面内部交互细节；交互级变更仍需要更新本矩阵或对应 e2e。

## 维护规则

- 新增 `src/app/**/page.tsx` 或 `api-contract.yaml` 变更后，先执行 `node --import tsx scripts/docs/feature-tree-generator.ts --save`
- 若新增用户主链路，补一条 QA 用例，并明确“手工 / 自动化映射”
- 优先复用已有 e2e 文件；只有出现明确覆盖缺口时，再新增 Playwright spec
