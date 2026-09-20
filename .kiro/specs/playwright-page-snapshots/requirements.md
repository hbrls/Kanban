# 需求文档：Playwright 页面快照机制

## 简介

为 Routa.js 项目建立自动化的页面快照机制，使用 playwright-cli 为每个关键页面生成结构化快照（YAML 格式）。这些快照将作为 AI 辅助测试的上下文信息，帮助 AI 更好地理解页面结构、定位元素、生成测试用例和调试问题。

快照机制将集成到现有的 Playwright e2e 测试流程中，自动捕获页面状态并存储为可版本控制的 YAML 文件，供 AI agent 在测试、调试和问题诊断时参考。

## 术语表

- **Snapshot**：playwright-cli 生成的页面状态快照，包含 DOM 结构、元素引用（e1, e2...）、页面标题、URL 等信息，以 YAML 格式存储
- **Snapshot_Generator**：负责自动生成和管理页面快照的工具模块
- **Page_Registry**：记录需要生成快照的页面列表及其访问路径的配置文件
- **Snapshot_Store**：存储快照文件的目录结构，按页面路径组织
- **Element_Reference**：playwright-cli 为页面元素生成的唯一标识符（如 e1, e2, e3），用于在测试中定位和操作元素
- **AI_Test_Context**：AI agent 在执行测试任务时可访问的上下文信息，包括页面快照、元素引用和页面结构
- **Snapshot_Validator**：验证快照文件完整性和有效性的工具

## 需求

### 需求 1：页面快照自动生成

**用户故事：** 作为开发者，我希望系统能自动为关键页面生成 Playwright 快照，以便 AI 能够理解页面结构并辅助测试。

#### 验收标准

1. THE Snapshot_Generator SHALL 使用 playwright-cli 为每个注册的页面生成 YAML 格式的快照文件
2. WHEN Snapshot_Generator 访问一个页面，THE Snapshot_Generator SHALL 执行 `playwright-cli snapshot --filename={page-name}.yaml` 命令
3. THE Snapshot_Generator SHALL 将快照文件存储到 `.playwright-snapshots/` 目录下，按页面路径组织子目录
4. WHEN 页面包含动态加载内容，THE Snapshot_Generator SHALL 等待页面完全加载后再生成快照
5. THE Snapshot_Generator SHALL 在快照文件中包含页面 URL、标题、所有可交互元素的引用（Element_Reference）和 DOM 结构
6. WHEN 快照生成失败，THE Snapshot_Generator SHALL 记录错误日志并继续处理下一个页面

### 需求 2：页面注册表配置

**用户故事：** 作为开发者，我希望通过配置文件声明需要生成快照的页面，以便灵活管理快照覆盖范围。

#### 验收标准

1. THE Page_Registry SHALL 使用 JSON 或 YAML 格式定义需要快照的页面列表
2. THE Page_Registry SHALL 为每个页面记录页面名称、访问路径、前置操作（如登录）和等待条件
3. WHEN 开发者添加新页面到 Page_Registry，THE Snapshot_Generator SHALL 在下次运行时自动为该页面生成快照
4. THE Page_Registry SHALL 支持页面分组，按功能模块（如 workspace、session、kanban）组织页面
5. THE Page_Registry SHALL 支持为页面定义多个状态变体（如空状态、加载状态、错误状态）
6. WHEN Page_Registry 配置无效，THE Snapshot_Validator SHALL 在启动时报告配置错误并拒绝执行

### 需求 3：快照版本管理

**用户故事：** 作为开发者，我希望快照文件能够纳入版本控制，以便追踪页面结构变化并在 PR 中审查。

#### 验收标准

1. THE Snapshot_Store SHALL 将快照文件存储在 `.playwright-snapshots/` 目录下，该目录应被 Git 跟踪
2. WHEN 页面结构发生变化，THE Snapshot_Generator SHALL 更新对应的快照文件
3. THE Snapshot_Generator SHALL 在快照文件头部添加生成时间戳和 Playwright 版本信息
4. WHEN 快照文件被更新，THE Snapshot_Generator SHALL 在 Git diff 中清晰展示元素引用和结构的变化
5. THE Snapshot_Store SHALL 使用规范化的文件命名格式：`{page-path}/{page-name}-{variant}.yaml`
6. THE Snapshot_Validator SHALL 在 CI 流程中验证快照文件与当前页面结构的一致性

### 需求 4：AI 测试上下文集成

**用户故事：** 作为 AI agent，我希望能够访问页面快照信息，以便生成准确的测试用例和定位页面元素。

#### 验收标准

1. THE AI_Test_Context SHALL 提供 API 接口，允许 AI agent 查询指定页面的快照内容
2. WHEN AI agent 请求页面快照，THE AI_Test_Context SHALL 返回 YAML 格式的快照数据，包含所有 Element_Reference
3. THE AI_Test_Context SHALL 支持按元素类型（button、input、link）过滤和查询 Element_Reference
4. THE AI_Test_Context SHALL 提供元素定位建议，基于快照中的元素属性（text、role、aria-label）
5. WHEN AI agent 生成测试代码，THE AI_Test_Context SHALL 提供快照中的 Element_Reference 作为选择器
6. THE AI_Test_Context SHALL 在快照不存在时返回明确的错误信息，提示需要先生成快照

### 需求 5：快照生成命令行工具

**用户故事：** 作为开发者，我希望能够通过命令行手动触发快照生成，以便在开发过程中及时更新快照。

#### 验收标准

1. THE Snapshot_Generator SHALL 提供 npm script `npm run snapshots:generate` 用于生成所有页面快照
2. THE Snapshot_Generator SHALL 支持 `npm run snapshots:generate -- --page=workspace` 参数，仅生成指定页面的快照
3. THE Snapshot_Generator SHALL 支持 `npm run snapshots:generate -- --update` 参数，仅更新已变化的快照
4. WHEN 快照生成完成，THE Snapshot_Generator SHALL 输出生成统计信息（成功数、失败数、更新数）
5. THE Snapshot_Generator SHALL 支持 `--headless=false` 参数，在可视化浏览器中生成快照以便调试
6. THE Snapshot_Generator SHALL 在生成过程中展示进度条和当前处理的页面名称

### 需求 6：快照差异检测

**用户故事：** 作为开发者，我希望在 CI 流程中检测页面结构变化，以便及时发现意外的 UI 改动。

#### 验收标准

1. THE Snapshot_Validator SHALL 提供 `npm run snapshots:validate` 命令，验证当前页面与快照的一致性
2. WHEN 页面结构与快照不一致，THE Snapshot_Validator SHALL 报告差异详情（新增元素、删除元素、属性变化）
3. THE Snapshot_Validator SHALL 支持配置容忍度阈值，忽略微小的 DOM 变化（如动态 ID）
4. WHEN 在 CI 环境中运行，THE Snapshot_Validator SHALL 在检测到差异时返回非零退出码
5. THE Snapshot_Validator SHALL 生成差异报告文件，包含变化的元素引用和建议的修复操作
6. THE Snapshot_Validator SHALL 支持 `--update-snapshots` 标志，自动更新快照以匹配当前页面状态

### 需求 7：快照元数据增强

**用户故事：** 作为 AI agent，我希望快照包含丰富的元数据信息，以便更好地理解页面语义和交互流程。

#### 验收标准

1. THE Snapshot_Generator SHALL 在快照中记录页面的主要交互区域（header、sidebar、main content）
2. THE Snapshot_Generator SHALL 为每个 Element_Reference 添加语义标签（如 "submit button"、"search input"）
3. THE Snapshot_Generator SHALL 记录页面的导航路径和前置条件（如需要登录、需要创建 workspace）
4. THE Snapshot_Generator SHALL 捕获页面的关键状态指示器（loading、error、empty state）
5. THE Snapshot_Generator SHALL 记录页面中的表单字段及其验证规则（required、pattern、min/max）
6. WHEN 页面包含动态内容，THE Snapshot_Generator SHALL 记录内容加载的触发条件和预期元素

### 需求 8：快照与 E2E 测试集成

**用户故事：** 作为开发者，我希望 E2E 测试能够自动引用快照中的元素，以便减少测试维护成本。

#### 验收标准

1. THE Snapshot_Generator SHALL 在每次 E2E 测试运行前自动更新快照（在 dev 模式下）
2. THE Snapshot_Generator SHALL 提供 Playwright 测试辅助函数，从快照中查询 Element_Reference
3. WHEN E2E 测试使用快照中的 Element_Reference，THE Snapshot_Generator SHALL 在元素不存在时提供清晰的错误信息
4. THE Snapshot_Generator SHALL 支持在测试失败时自动捕获当前页面快照，用于问题诊断
5. THE Snapshot_Generator SHALL 提供快照比对工具，在测试中验证页面结构符合预期快照
6. WHEN 快照中的元素在页面中找不到，THE Snapshot_Validator SHALL 建议可能的替代元素引用

