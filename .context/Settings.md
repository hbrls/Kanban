# Settings 功能说明与分析

本文说明当前 Settings 功能的组成、Models 页面用途及其与 ACP、会话和 Kanban 的边界。

## 1. Settings 的定位

Settings 是应用级配置入口，当前代码包含以下几类配置面：

- Providers：查看可用 Provider、Provider 凭据和自定义 ACP Provider。
- Registry：浏览或安装 ACP Agent。
- Roles：为内置 Routa 角色设置默认 Provider 和 Model。
- Models：维护自定义模型别名及连接信息。
- Webhooks：查看开发期 Webhook 配置。

Models 页面位于 Settings 面板和 Settings Center 导航中，由 `src/client/components/settings-panel-models-tab.tsx` 实现。

## 2. Models 页面的功能

Models 页面维护 `ModelDefinition`：

```text
alias -> modelName
      + baseUrl
      + apiKey
```

字段含义：

- `alias`：应用内使用的短名称。
- `modelName`：实际传递给 Agent 的模型 ID。
- `baseUrl`：模型连接使用的自定义 API 地址。
- `apiKey`：模型连接使用的密钥。

配置保存于 WebView `localStorage` 的 `routa.modelDefinitions`，不是 Rust/SQLite 数据。当前 API Key 也会以明文 JSON 保存在该存储中。

共享定义和读取逻辑位于 `src/client/components/settings-panel-shared.ts`：

- `ModelDefinition`
- `loadModelDefinitions`
- `saveModelDefinitions`
- `getModelDefinitionByAlias`

## 3. 当前使用链路

Home 和 Session 页面在创建会话时，会把用户输入或角色/Specialist 配置中的模型字符串当作 alias 尝试解析：

```text
model alias or model ID
    -> getModelDefinitionByAlias
    -> resolved modelName / baseUrl / apiKey
    -> ACP session creation
```

相关调用位于：

- `src/client/components/home-input.tsx`
- `src/app/workspace/[workspaceId]/sessions/[sessionId]/session-page-client.tsx`

如果找不到 alias，原始字符串会继续作为模型 ID 使用。

Roles 和 Specialists 的模型输入目前会读取已有 ModelDefinition，提供 alias datalist，但这些输入本身仍可直接填写原始模型 ID。

## 4. Rust-only 桌面运行面的事实

桌面业务运行面是 Rust/Axum。Rust `session/new` 当前读取 `model`，并把它交给 `AcpManager`；`AcpManager` 负责启动本机 Agent 并传递启动参数。

当前 Rust `session/new` 没有读取前端传入的 `baseUrl` 或 `apiKey` 的逻辑。因此，Models 页面中的连接字段并不是 Rust-only 桌面运行面的完整配置机制，属于前端历史/兼容路径的一部分。

这不改变以下边界：

- `AcpManager` 不负责安装本机 Agent。
- `AcpManager` 不负责管理 Agent 的登录和认证。
- Routa 不负责维护模型供应商目录或验证模型可用性。
- Kanban 的模型选择和自动化属于 Kanban 自己的功能，不由 Settings Models 页面定义。

## 5. 与 Kanban 的边界

Kanban 已经拥有自己的 Provider、Role、Specialist 和 Model 选择行为。Kanban 负责任务进入列后的 Agent 选择与自动化，未来优化也由 Kanban 自己负责。

删除 Settings Models 页面时，以下内容属于外部边界，不能被改动：

- Kanban 页面和 Kanban 设置。
- Kanban automation、列转换和任务触发链路。
- Kanban 当前的 Model 选择行为。
- `AcpManager`、Rust ACP API 和 Agent 启动参数。

## 6. 分析结论

Models 页面是一个全局模型别名和连接信息管理界面。它不是 Kanban 的必要组成部分，也不是 `AcpManager` 的职责。

后续删除范围应限定为 Settings 页面本身及其导航入口。共享 ModelDefinition 读取和 alias 解析属于现有会话兼容逻辑，在没有单独迁移计划前应继续保留，避免改变当前 Model 选择和已有 localStorage 配置的行为。
