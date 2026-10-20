---
title: "CLI 实现 @ 符号选择 Specialist 并创建 Agent"
date: "2026-03-08"
status: resolved
severity: medium
area: "cli"
tags: ["cli", "tui", "specialist", "agent"]
reported_by: "human"
related_issues: [
  "https://github.com/phodal/routa/issues/56",
  "https://github.com/phodal/routa/issues/90"
]
---

# 在 TypeScript CLI (Rust) 中实现 @ 符号选择 Specialist 功能

## What Happened

<!-- 用户希望能够在 Routa CLI 中通过类似 @ 的方式快速选择 specialist 并创建 agent -->

## Expected Behavior

### TUI 交互模式
1. 用户在 CLI 中输入 `@` 字符
2. 系统显示可用的 specialist 列表（如 ROUTA、CRAFTER、GATE、DEVELOPER + 自定义 specialists）
3. 用户通过方向键选择某个 specialist，按回车确认
4. 系统为该 specialist 创建对应的 agent
5. 用户输入 prompt，agent 开始执行任务

### CLI 参数模式
```bash
# 直接指定 specialist 执行任务 (使用短参数 -s)
routa agent run -s crafter -p "实现一个 hello world 函数"

# 交互式选择 specialist 后执行
routa agent run --specialist
# 然后在交互式界面选择 specialist
```

### 全局配置支持
- Specialist 定义支持配置在 `~/.routa/specialists/` 目录
- 支持 YAML 和 Markdown (带 frontmatter) 格式

## User Stories

- **US1**: 作为用户，我希望通过 `@` 在 CLI 中快速选择 specialist，而不需要记住所有 specialist 的名称
- **US2**: 作为用户，我希望能够通过命令行参数直接指定 specialist 并执行任务
- **US3**: 作为用户，我希望选择 specialist 后可以直接输入 prompt，让 agent 自动完成工作

## Implementation Approach

### 1. CLI 参数设计

```rust
// crates/routa-cli/src/main.rs
#[derive(Parser)]
pub struct Cli {
    // ... existing fields

    // 新增 agent 子命令
    #[command(subcommand)]
    command: Option<Commands>,
}

enum Commands {
    // 新增 agent 命令
    Agent(AgentCommand),
}

enum AgentCommand {
    Run {
        /// Specialist 名称 (如 crafter, gate, developer)
        #[arg(short = 's', long)]
        specialist: Option<String>,

        /// 要执行的 prompt
        #[arg(short = 'p', long)]
        prompt: Option<String>,

        /// 工作区 ID
        #[arg(short = 'w', long, default_value = "default")]
        workspace_id: String,

        /// ACP provider
        #[arg(long, default_value = "opencode")]
        provider: String,

        /// Specialist 定义目录 (可配置在 ~/.routa/specialists/)
        #[arg(short = 'd', long)]
        specialist_dir: Option<String>,
    },
}
```

### 2. TUI @ 提及功能实现

参考前端 `tiptap-input.tsx` 的 mention 实现思路，在 Rust CLI 中：

1. 使用 `crossterm` 或 `ratatui` 实现交互式 TUI
2. 监听用户输入，当检测到 `@` 字符时：
   - 加载可用 specialists 列表
   - 显示下拉选择框
   - 支持键盘导航（上下箭头 + 回车）
3. 选中后创建对应 agent

### 3. Specialist 加载

```rust
// 复用现有的 specialist 加载逻辑
// 参考 src/core/orchestration/specialist-prompts.rs
fn load_available_specialists() -> Vec<Specialist> {
    // 1. 从 ~/.routa/specialists/ 加载用户自定义 (最高优先级)
    // 2. 从 ./specialists/ 加载项目级配置
    // 3. 从 resources/specialists/ 加载内置
    // 4. 硬编码的 fallback (ROUTA, CRAFTER, GATE, DEVELOPER)
}

// Specialist 搜索路径
fn get_specialist_search_paths() -> Vec<PathBuf> {
    let mut paths = vec![];

    // 用户全局配置 ~/.routa/specialists/
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".routa").join("specialists"));
    }

    // 当前项目路径
    paths.push(PathBuf::from("specialists"));
    paths.push(PathBuf::from("resources/specialists"));

    paths
}
```

## Technical Considerations

- **TUI 库选择**: 考虑使用 `ratatui` 或 `crossterm` 实现交互式 CLI
- **Specialist 列表来源**: 需要复用现有的加载逻辑（specialist-store.ts, specialist-file-loader.ts）
- **Agent 创建**: 复用 `chat.rs` 中创建 agent 的逻辑
- **向后兼容**: 现有的 `routa chat` 命令应该继续工作

## Relevant Files

### 需要修改的文件
- `crates/routa-cli/src/main.rs` - 添加新的 CLI 参数
- `crates/routa-cli/src/commands/mod.rs` - 添加 agent 命令
- `crates/routa-cli/src/commands/agent.rs` - 新建，实现 agent run 逻辑

### 需要参考的文件
- `crates/routa-cli/src/commands/chat.rs` - 现有的 agent 创建逻辑
- `crates/routa-cli/src/commands/delegate.rs` - specialist 委托逻辑
- `src/core/orchestration/specialist-prompts.ts` - Specialist 加载逻辑
- `src/client/components/tiptap-input.tsx` - 前端 @ mention 实现参考

## Phases

### Phase 1: CLI 参数实现
- [ ] 添加 `routa agent run` 命令
- [ ] 支持 `--specialist` 和 `--prompt` 参数
- [ ] 实现基础的 agent 创建和任务执行

### Phase 2: TUI @ 提及功能
- [ ] 在 CLI 交互模式中检测 `@` 字符
- [ ] 实现 specialist 列表展示和选择
- [ ] 集成 agent 创建流程

### Phase 3: 增强功能
- [ ] 支持自定义 specialist
- [ ] 添加帮助提示和命令补全
- [ ] 优化用户体验

## Resolution

Resolved by later CLI specialist execution work.

Evidence in current CLI:

- `crates/routa-cli/src/commands/chat.rs` explicitly supports `@` at the start of a message to open an interactive specialist picker.
- The same chat command supports inline `@specialist ...` parsing and specialist prompt injection.
- `crates/routa-cli/src/main.rs` now exposes `routa agent run` with:
  - `-s/--specialist`
  - `-p/--prompt`
  - `-d/--specialist-dir`
- `crates/routa-cli/src/commands/agent.rs` resolves specialists from configured directories and also supports prompt-level specialist mention parsing.
- Git history shows the main landing commit:
  - `5d894bc feat(cli): streaming TUI renderer and @ specialist mention in chat`

The exact UX evolved from the original sketch, but the capability requested by this issue is now present.
