# 当前任务：极简清理 PostgreSQL 支持

## 目标与范围

删除代码中的 PostgreSQL（PG）支持，数据库持久化仅使用 SQLite。本任务只清理代码，不推进 Next.js → Rust 的整体迁移。

- 不修改文档；文档由其他工程师处理。本文件是按用户要求保存的任务方案。
- 不移动文件、不重命名文件，不因 `pg-*.ts` 的名称调整结构。
- 不补齐功能、不调整数据库结构、不进行无关重构。
- 不处理现有 SQLite 失败后的内存回退。
- 不修改配置示例文件。

## 实施方案

### 1. 移除 PG 入口

- 在 `src/core/db/index.ts` 原地删除 PG 驱动导入、连接逻辑和选择分支，沿用现有 SQLite 路径。
- 在 `src/core/routa-system.ts` 删除 `createPgSystem()` 及其调用、PG 专属导入。
- 删除数据库和 platform 类型中的 `"postgres"` 分支，同步修正受影响的调用方与 SQLite 类型。

### 2. 删除 PG 实现，保留共享内容

- 检查 `src/core/db/pg-*.ts` 的引用。
- 仍被使用的接口、类型和内存实现原地保留，文件名称不变。
- 原地删除 PG 实现类；仅含 PG 实现且已无引用的文件直接删除。
- 删除 PG schema 数据库定义前核对共享类型引用，必要的共享类型原地保留。
- 不为删除 PG 而提取接口、移动类型或重组目录。

### 3. 清理调用链

- 原地删除自定义 MCP、Webhook store 与工厂中的 PG 实现和分支，保留现有 SQLite 实现。
- 删除 Skill resolver 和 ACP session 创建流程中的 PG 查询分支，沿用已有本地加载逻辑。
- 删除 Session、Trace 的 PG remote providers 及关联读写、压缩分支，保留现有本地存储链路。
- Specialist 尚未实现的操作保持未实现，不新增 SQLite CRUD；仅移除代码和界面中“需要 PG”的错误提示，UI 文案仍通过 i18n 提供。
- 检查 barrel exports、动态 import/require、platform bridge，清理悬空引用。

### 4. 清理依赖和测试

- 删除 `postgres`、`@neondatabase/serverless` 直接依赖，更新 pnpm lockfile。
- 保留 SQLite 仍使用的 `drizzle-orm`。
- 删除 PG 专属测试，调整受影响的 mock、导入和类型断言。
- 运行受影响代码的类型检查和相关测试，验证现有 SQLite 路径。
- 不因 lockfile 中出现 PG 字样就盲目删除传递依赖；以实际依赖关系为准。

## 验收标准

- 可执行代码中没有能选择或连接 PG 的路径。
- 没有因清理产生的悬空导入、导出或类型引用。
- 类型检查及相关自动化测试通过，现有 SQLite 功能保持可用。
- 文件未移动、未重命名；未补功能、未修改文档和配置示例。
- 说明实际执行的验证，不把源码检查当作运行验证。

## 已知工作区约束

调查时 `src/core/background-worker/index.ts` 已有修改。实施前重新检查工作区状态，保留已有修改，不覆盖其他人的工作。
