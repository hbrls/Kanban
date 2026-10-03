---
dimension: ui_consistency
weight: 8
tier: normal
threshold:
  pass: 90
  warn: 80
  block: 0

metrics:
  - name: desktop_shell_route_regression
    command: npm run test:e2e:desktop-shell 2>&1
    pattern: '\d+\s+passed'
    hard_gate: true
    tier: deep
    description: "桌面 shell 的关键路由、导航入口与视觉基线回归"

  - name: desktop_shell_token_wiring
    command: "rg -q -- '--dt-bg-primary|--dt-bg-secondary|--dt-border|--dt-accent' src/app/styles/desktop-theme.css && rg -q 'desktop-theme' 'src/client/components/desktop-layout.tsx' && rg -q 'desktop-theme' 'src/client/components/desktop-app-shell.tsx' && rg -q 'desktop-(bg|text|border|accent)' 'src/client/components/desktop-sidebar.tsx' && rg -q 'desktop-(bg|text|border|accent)' 'src/client/components/desktop-nav-rail.tsx' && rg -q 'desktop-(bg|text|border|accent)' 'src/client/components/workspace-switcher.tsx' && echo 'desktop shell tokens wired'"
    pattern: "desktop shell tokens wired"
    hard_gate: false
    tier: normal
    description: "关键 shell 组件仍接入共享 dt tokens，而不是完全回退到页面内硬编码配色"

  - name: desktop_shell_color_contract
    command: "npx eslint src/client/components/desktop-layout.tsx src/client/components/desktop-app-shell.tsx src/client/components/desktop-sidebar.tsx src/client/components/desktop-nav-rail.tsx"
    hard_gate: false
    tier: normal
    description: "共享 shell 组件禁止重新引入硬编码颜色或 palette utility"

  - name: desktop_shell_page_coverage
    command: "rg -q 'DesktopAppShell|DesktopLayout|DesktopNavRail' 'src/app/traces/page.tsx' 'src/app/workspace/[workspaceId]/workspace-page-client.tsx' 'src/app/workspace/[workspaceId]/kanban/kanban-page-client.tsx' 'src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx' && echo 'desktop shell coverage wired'"
    pattern: "desktop shell coverage wired"
    hard_gate: false
    tier: normal
    description: "关键桌面页面继续通过共享 shell 组件接入，而不是复制各自的页面壳体"
---

# Desktop Shell 设计系统 Fitness

## 这份文档现在解决什么问题

这份文件不再假装承担“全仓 design system fitness”。

它只负责约束一件更具体、也更容易失真的事情：`desktop shell` 的主题 token、共享壳体和关键导航路径，是否仍然保持同一套 contract。

旧版本的问题是：

- 只有一条 E2E 命令，但正文写的是“主题一致性验收”，描述范围远大于实际可验证范围。
- 它能证明“页面大致还能打开”，却不能证明“desktop shell 还在吃同一套 token”。
- 它没有定义哪些文件属于 shell，哪些颜色漂移属于真正违规，结果就是文档看起来存在，但不驱动实际决策。

## 单一事实来源

Desktop shell 的视觉 contract 以这几处为准：

- `src/app/styles/desktop-theme.css`
  - `.desktop-theme`
  - `--dt-*` tokens
- `src/client/components/desktop-layout.tsx`
- `src/client/components/desktop-app-shell.tsx`
- `src/client/components/desktop-sidebar.tsx`
- `src/client/components/desktop-nav-rail.tsx`
- `src/client/components/workspace-switcher.tsx` 的 desktop / compact 分支

如果桌面页面要新增背景、边框、active、hover、标题栏、导航态，优先扩展 `--dt-*`，而不是在页面里重新发明一组颜色。

## 这份 fitness 真正验证什么

### 1. 运行时回归

- `/`
- `/workspace/[workspaceId]`
- `/workspace/[workspaceId]/kanban`
- `/traces`

这些关键入口至少要保证：

- 页面能打开，主布局仍存在。
- 导航入口无 dead-link。
- 标题栏、侧边栏、主内容区的基本布局没有明显回退。

这部分由 `desktop_shell_route_regression` 负责，是硬门禁。
它现在不仅检查路由是否能打开，也要求关键 chrome 通过 Playwright screenshot baseline。

### 2. Token 接线没有断

这不是做“颜色审美判断”，而是做“结构约束判断”：

- `desktop-theme.css` 中必须还存在 `.desktop-theme` 的 `--dt-*` token。
- shell 组件必须继续消费这些 token。
- 关键组件不能整体回退成各写各的 light/dark class。

这部分由 `desktop_shell_token_wiring` 与 `desktop_shell_color_contract` 共同负责，是软门禁。

### 3. 页面仍然复用共享壳体

关键桌面页面必须继续挂在共享 shell 组件上，而不是每个页面复制一份标题栏、侧边栏和容器结构。

当前要求覆盖：

- traces page
- workspace dashboard
- kanban page
- session detail page 的 desktop rail

这部分由 `desktop_shell_page_coverage` 负责，是软门禁。

## 不在这份文档里的内容

下面这些问题重要，但不应该塞进这个文件冒充“已覆盖”：

- 全仓所有 React 组件的颜色统一
- 内容区语义色（success / warning / role badge / chart color）
- Marketing / Home 非 desktop 样式系统
- 第三方渲染器、代码高亮、富文本主题
- 像素级视觉回归

如果以后要做“全局 design token 违规扫描”，应该新建单独 fitness 文档或脚本，不要继续把范围堆到这里。

## 适用范围

这份文件只对 desktop shell 范围生效，重点包括：

- 共享标题栏 / 侧边栏 / navigation rail
- workspace dashboard 壳体
- kanban 壳体
- traces 壳体
- session detail 的 desktop rail 接入

## 变更规则

满足以下任一条件，就必须同时检查和更新这份文件：

- 新增 desktop 页面或新的 desktop 路由入口
- 修改 sidebar / nav rail / title bar / workspace switcher
- 新增 shell 级背景、边框、文本、active、hover 状态
- 调整 `/workspace/[workspaceId]`、`/workspace/[workspaceId]/kanban`、`/traces`、session detail 的桌面布局

更新要求：

1. 先保证新页面接入共享 shell 或明确说明为什么不能接入。
2. 再补 Playwright 覆盖或更新现有 case。
3. 若新增的是 shell 级视觉状态，优先扩展 `--dt-*` token。
4. 最后更新本文件正文中的范围、例外或已知缺口。

## 评审清单

- 桌面页面容器背景是否仍来自 `--dt-bg-*`
- 侧边栏 / 标题栏 / 分隔线是否仍来自 `--dt-border` 与相关 token
- active / hover 是否沿用统一 accent 体系
- 页面有没有重新引入一套独立的 shell 背景色
- 导航是否出现新 dead-link
- 新页面是否复用了现有 shell，而不是复制 layout

## 已知缺口

- 当前没有“全仓硬编码颜色扫描”脚本；这会产生误报，因为仓库里仍有大量内容区语义色和第三方主题色。
- `desktop_shell_token_wiring` 只能证明“接了 token”，不能证明“没有任何局部例外”。
- Playwright 现在已经有局部 screenshot baseline，但仍是 shell chrome 级，不是完整页面像素 diff。

这些缺口应该被显式承认，而不是被文档措辞掩盖。

## 当前例外判断

以下情况默认不视为 shell 违规：

- 业务状态色、角色色、告警色
- 图表 / workflow / trace 可视化颜色
- 第三方编辑器、高亮主题、markdown 渲染配色
- 非 desktop 分支的普通 web 主题

但如果这些颜色直接占用了 shell 背景、标题栏、侧边栏、主容器边框的位置，就仍然算违规。

## 结论

这份文件的目标不是证明“整个设计系统已经完美统一”，而是把最容易回退的桌面壳体 contract 固定下来：

- 路由和布局还能跑
- token 体系还在被用
- 关键页面还在复用共享 shell

只有这样，它才会真正对设计系统演进产生约束力，而不是停留在一次性改造的验收备注。
