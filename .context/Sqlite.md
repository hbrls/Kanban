# SQLite 现状分析（Rust 侧）

分析日期：2026-10-03

## 前提

1. 唯一后端是 Rust（`crates/routa-server` + `crates/routa-core`），TS/Next.js 将删除，**不在本次分析范围**
2. 不使用 ORM，直接写 SQL 是既定做法，**不是问题**
3. 不引入 init/migration 机制；init SQL 应外置成文件；**代码假定数据库一定是好的**

分析范围：`crates/` 下的 `.rs`。TS、drizzle 目录、Postgres 相关代码均按前提排除。

---

## 一、现状

### 1.1 依赖

`crates/routa-core/Cargo.toml:30`

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
```

全 workspace 唯一的 DB 依赖。`bundled` 表示 SQLite 静态编入二进制，不依赖系统库。无 ORM、无迁移 crate、无连接池。

### 1.2 数据库文件

- 默认路径 `routa.db`（`crates/routa-server/src/lib.rs:68`）
- **生产打开点唯一**：`create_app_state()`（`lib.rs:79`）→ `db::Database::open(db_path)`
- 测试用 `Database::open_in_memory()`，全仓库 26 处

### 1.3 `crates/routa-core/src/db/mod.rs` 结构（449 行）

| 函数 | 行 | 行数 | 职责 |
|---|---|---|---|
| `ignore_duplicate_column` | 20-35 | 16 | 吞掉 "duplicate column name" 错误，幂等掩体 |
| `open` | 37-58 | 22 | 打开 + PRAGMA(WAL/外键) → `initialize_tables()` |
| `open_in_memory` | 60-74 | 15 | 同上，内存库 |
| `with_conn` | 76-87 | 12 | 加锁 + 错误转换 |
| `with_conn_async` | 89-99 | 11 | `spawn_blocking` 包 `with_conn` |
| `initialize_tables` | 101-358 | **258** | 15 张 `CREATE TABLE IF NOT EXISTS` |
| `run_migrations` | 359-447 | **89** | ~40 条 `ALTER TABLE ADD` + 2 张补建表 |

连接模型：单连接 `Arc<Mutex<Connection>>`（:16），一把全局锁串行化所有访问。

内嵌 SQL 语句总计 **75 条**，347 行 SQL 字符串写在 `initialize_tables` + `run_migrations` 里。

### 1.4 建表 SQL 的实际形态（关键）

**`initialize_tables()` 里的 `CREATE TABLE` 只是历史基线，不是完整 schema。**

完整 schema = `CREATE TABLE` 的列 ∪ `run_migrations()` 里所有 `ALTER TABLE ADD` 的列。

各表累积后的列数：

```
tasks 45   acp_sessions 17   artifacts 14   notes 13   schedules 13
worktrees 12   skills 11   agents 10   codebases 10   event_subscriptions 9
kanban_boards 8   messages 8   pending_events 7   workspaces 6   workspace_skills 3
```

其中 `kanban_boards`(:402) 和 `artifacts`(:416) **只在 `run_migrations()` 里补建**，`initialize_tables()` 里没有。

### 1.5 store 层

- 12 个 store 文件引用 `db`，11 个在 `store/mod.rs` 注册
- 87 处 `with_conn` 调用
- 行映射用**下标**：`task_store.rs:311` `row.get(42)` / `row.get(43)`，配合 store 内显式列出的 SELECT 列表

---

## 二、核对结果

以 **store 代码为需求基准**，对照 DDL 建表内容逐项核对。

| 检查项 | 结果 |
|---|---|
| store 访问的表是否都已建 | ✅ 通过。11 个活跃 store 访问的 11 张表全在 DDL 里 |
| INSERT 列是否都在表里 | ✅ 通过，0 缺列 |
| SELECT 列是否都在表里 | ✅ 通过，45 条 SELECT，0 缺列 |
| 下标映射与 SELECT 列数是否一致 | ✅ 通过。`tasks`：最大下标 43，SELECT 44 列 |
| DDL 建了但无人访问的表 | ⚠️ **4 张**（见 2.1） |
| 有 SQL 但表未建的 store 文件 | ⚠️ **1 个**（见 2.2） |

**结论：活跃链路上 schema 与代码是一致的**，没有"表不存在/列不存在"的运行时地雷。问题集中在两处死代码。

### 2.1 四张死表

`workspace_skills`、`event_subscriptions`、`pending_events`、`skills`

这四张表只在 `db/mod.rs` 里出现（建表语句本身），全 `crates/` 无任何 `FROM` / `INTO` / `UPDATE` 引用。建了但永远不会被读写。

### 2.2 `custom_mcp_server_store.rs` 是死文件

- 它对 `custom_mcp_servers` 有完整 CRUD（`INSERT` :41 / `SELECT` :73,:97,:115 / `UPDATE` :156 / `DELETE` :186）
- 但 `custom_mcp_servers` 表在 `db/mod.rs` 里**完全没有出现**（0 次）
- 且该文件**未在 `store/mod.rs` 声明**——Rust 不编译未声明的模块文件

**结论：不是运行时 bug（代码根本不会执行），是彻底死代码。** 该文件与 `custom_mcp_servers` 表要么一起补上，要么一起删除。需确认 MCP server 能力现在由谁提供。

---

## 三、与目标的差距

目标形态：schema 是外部 `.sql` 文件；`Database` 只负责打开连接；代码假定库已就绪。

需要做的事：

1. 把 `initialize_tables()` + `run_migrations()` **合并成一份完整 schema 文件**
2. 从 `open()` / `open_in_memory()` 里摘掉建表调用
3. 建立外部 bootstrap 入口

### 障碍

**a. 幂等性来源会消失**

现在靠 `ignore_duplicate_column` 吞 "duplicate column name" 实现可重复执行。SQL 外置后重复执行会真报错——SQLite 没有 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 语法，所以文件无法靠 `IF NOT EXISTS` 做到完全幂等。要么约定只执行一次，要么在文件外保留一个小的幂等层。

**b. 测试基建受影响**

26 处 `open_in_memory()` 依赖"打开即建表"。摘掉后内存库需要单独的加载路径（例如执行同一份 `.sql` 文件）。

**c. bootstrap 入口需要决策**

代码假定库已就绪，那"谁把库弄就绪"必须有人负责。可选方案：

- 安装/首次启动时由 Tauri 侧执行 schema 文件
- 打包时预置一个空库文件
- 保留一个独立入口（不叫 migration，就叫 init）

**这是唯一需要拍板的点。**

**d. 列顺序耦合（知情即可）**

schema 文件与 store 是解耦的（SELECT 显式列名）。但 store 内部「SELECT 列表顺序 ↔ `row_to_*` 下标」是硬耦合（如 `tasks` 的 44 列 ↔ 下标 0-43）。加列时必须同时改：schema 文件 + 每个 SELECT 列表 + 下标常量。SQL 外置不会让它变好或变坏。

---

## 四、待确认

1. bootstrap 入口选哪种（三. c）
2. 4 张死表是否直接删——是否有外部用途或未实现的规划
3. `custom_mcp_server_store.rs` 是否随 TS 一起删——对应的 MCP server 管理能力现在由谁提供

---

## 五、附录：分析口径

- **表访问提取**：只解析含 SQL 关键字的字符串字面量（`"..."` / `r"..."` / `r#"..."#`），避免把注释和文档里的普通单词误判成表名
- **列集合**：`CREATE TABLE` 的列 + 同文件所有 `ALTER TABLE ... ADD` 的列，累积后为完整 schema
- **行映射核对**：正则提取 `row.get(N)` 的下标，与对应 SELECT 的列数比对

### 附：本次分析中修正的错误

前两轮分析以 TS 侧 `sqlite-schema.ts`（23 张表）为基准，得出"Rust 缺 8 张表"的结论——**该结论作废**。那 8 张表（`session_messages`、`background_tasks`、`github_webhook_configs`、`webhook_trigger_logs`、`artifact_requests`、`specialists`、`workflow_runs`、`custom_mcp_servers`）出现的原因是把 TS 的存在当成了 Rust 的需求。以 Rust 自己的 store 代码为基准重新核对后，活跃链路完全自洽，实际只有 4 张死表 + 1 个死文件。
