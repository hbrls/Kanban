# Vision 固定数据入口拆分方案

- 日期：2026-10-04
- 状态：方案完成，待实施；本文不代表数据拆分已经完成。
- 当前授权：仅分析并覆盖本方案文档。架构师不修改产品代码、不安装依赖、不启动实现、测试或构建。
- 开发边界：遵循 `DEVELOPMENT.md`，交付环境为 Tauri 静态前端；保持 UI 概念验证，无后端、无数据库，示例数据写死，交互状态只存于前端内存。

## 1. 本轮目标

将 Vision 中固定的数据记录集中抽取到功能目录下的 `vision-database.ts`，以模拟未来数据库提供数据之后的读取边界。

`vision-database.ts` 只是静态 TypeScript 数据模块，不是真实数据库，不安装数据库依赖，也不提供查询服务、持久化或网络接口。

默认导出 tasks，通过 import 消费数据；`vision-graph.ts` 保留数据到画布的转换和布局规则。页面外观与所有既有交互保持不变。

## 2. 已实施基线

用户确认上一轮逻辑行和物理 Mask 已由另一个 agent 实施，当前看起来没有问题。现有固定示例如下：

| Task | 节点 ID | 文案 key | rowId | 初始 X | 固定 Y |
|---|---|---|---|---:|---:|
| Task1 | `vision-task-1` | `defineRequirements` | `row-1` | 0 | 0 |
| Task2 | `vision-task-2` | `designSolution` | `row-1` | 720 | 0 |
| Task3 | `vision-task-3` | `validateDelivery` | `row-1` | 1080 | 0 |
| Task4 | `vision-task-4` | `coordinateIntegration` | `row-2` | 360 | 280 |

固定连接为 `Task1 → Task4 → Task2 → Task3`，现有连接 ID 为 `vision-edge-1`、`vision-edge-2`、`vision-edge-3`。

- 每个 Task 只有一个 rowId；Row 为逻辑概念，没有背景、标题、容器或 Group。
- X 按 24 个画布单位吸附，Y 固定为所在行位置；无碰撞、排序、插入或横向阻挡。
- 当前从 row-2 开始为现在，row-1 为过去，没有未来。
- 物理 Mask 为 20% 不透明度，其零厚度逻辑边界在 row-2 顶部上方 48 个画布单位，当前画布 Y 为 232。
- Mask 接收并阻拦鼠标，过去 Task 自身属性和交互逻辑不作特殊调整。
- 保留 Header、Content、Footer 卡片、中英文、明暗主题、MiniMap、视图控件、重置及静态桌面路由。

本轮只改变数据组织，不重新实施或改变以上能力。

## 3. 数据与渲染的职责边界

| 内容 | 归属 |
|---|---|
| Task ID、文案 key、rowId、初始 X | `vision-database.ts` |
| Row ID 和排列顺序 | `vision-database.ts` |
| 连接 ID、source Task ID、target Task ID | `vision-database.ts` |
| 当前起始行 row-2 | `vision-database.ts` |
| 数据记录类型 | `vision-database.ts` |
| 卡片宽度 220、行距 280、横向网格间距 24、Mask 边界留白 48 | `vision-graph.ts` |
| 数据转换为 React Flow Node/Edge | `vision-graph.ts` |
| task 节点类型、smoothstep、终点箭头 | `vision-graph.ts` |
| 行 Y 和 Mask 边界 Y 的计算 | `vision-graph.ts` |
| 拖动坐标、选择、节点测量和视口状态 | Canvas 及 React Flow 的现有内存状态 |
| 中英文字符串 | 现有 i18n 词典 |
| 颜色、20% Mask 不透明度和局部视觉样式 | 现有 CSS 和组件 |

数据模块只表达记录和关系，不能包含 React Flow 的 Node、Edge、MarkerType、Handle、选中状态、dragging、measured 或 viewport。

Task 中的 x 是固定示例提供的初始画布位置，属于当前概念验证的数据输入，不表示已确定未来数据库 Schema。Y 根据行顺序和统一行距派生，不在 Task 中重复保存。

## 4. vision-database.ts 的具体设计

### 4.1 记录类型

本轮保持类型简单且明确：

```ts
export type VisionRowId = "row-1" | "row-2";

export type VisionTaskTitleKey =
  | "defineRequirements"
  | "designSolution"
  | "validateDelivery"
  | "coordinateIntegration";

export interface VisionTaskRecord {
  readonly id: string;
  readonly titleKey: VisionTaskTitleKey;
  readonly rowId: VisionRowId;
  readonly x: number;
}

export interface VisionRowRecord {
  readonly id: VisionRowId;
  readonly order: number;
}

export interface VisionConnectionRecord {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}
```

类型不依赖后端 Task 模型，不引入数据库 SDK、React、React Flow 或业务运行时。固定 union 类型用于本轮两个 Row 和四份演示文案，未来真实数据结构另行设计。

### 4.2 默认导出 tasks

`tasks` 为只读数组，保留第 2 节中的四条记录及现有 ID、文案 key、rowId、x。默认导出该数组：

```ts
const tasks: ReadonlyArray<VisionTaskRecord> = [
  // 四条固定 Task 记录
];

export default tasks;
```

不导出 React Flow nodes，也不在数组中保存 position、type、data 或其他渲染结构。

### 4.3 具名导出其他数据

同一文件具名导出：

- `rows: ReadonlyArray<VisionRowRecord>`：row-1 的 order 为 0，row-2 的 order 为 1。
- `connections: ReadonlyArray<VisionConnectionRecord>`：保留现有三条连接 ID 与 source/target。
- `currentStartRowId: VisionRowId`：固定为 row-2。

不将连接改为每条 Task 上的 nextTaskId，避免同时维护两套关系。Task 数组顺序保持现有顺序，不将其当作任务执行顺序；连线才表达固定连接关系。

### 4.4 消费方式

在 `vision-graph.ts` 中导入：

```ts
import tasks, {
  rows,
  connections,
  currentStartRowId,
  type VisionRowId,
  type VisionTaskTitleKey,
} from "./vision-database";
```

用户要求的文件名是 `vision-database.ts`。导入按仓库现有 TypeScript 写法省略 `.ts` 扩展名，不为带扩展名导入修改 tsconfig。

组件继续消费 `vision-graph.ts` 的画布接口，避免每个组件各自直接读取和转换数据库模拟记录。

## 5. vision-graph.ts 的调整

### 5.1 保留转换接口

保留当前供组件使用的接口：

- `VisionTaskNodeData`、`VisionTaskNode`。
- `VISION_TASK_NODE_WIDTH`、`VISION_GRID_SIZE`。
- `getRowY(rowId)`。
- `getPastBoundaryY()`。
- `createInitialNodes()`。
- `createInitialEdges()`。

移动 `VisionRowId` 和 `VisionTaskTitleKey` 的定义到数据模块后，可通过 type re-export 保留原有 import 路径，减少不必要的组件改动。

现有当前起始行常量如仍有消费者，可从数据模块读取并维持兼容导出；只能有一个实际值来源，不在 graph 再写一份 row-2。

### 5.2 行布局

用固定行距 280 和 Row 的 order 计算 Y：

```text
rowY = row.order × 280
```

因此 row-1 的 Y 为 0，row-2 的 Y 为 280，完全保持现有布局。

移除 graph 中重复写死的 ROW_POSITIONS 数据表，复用数据模块的 rows。行距是画布布局规则，留在 graph。只需直接查找或预生成简单映射，不新增行布局引擎。

### 5.3 节点转换

`createInitialNodes()` 遍历导入的 tasks，创建新的 React Flow Node：

- id 取 Task id。
- type 固定为现有 task。
- position.x 取 Task x。
- position.y 通过 getRowY(Task rowId) 生成。
- data 包含 titleKey 和 rowId。

每次调用创建独立节点、position 和 data 对象，不将只读 Task 记录直接作为可变状态对象。

### 5.4 连线转换

`createInitialEdges()` 遍历 connections，创建新的 React Flow Edge：

- id、source、target 来自连接记录。
- type 固定为 smoothstep。
- markerEnd 使用现有 MarkerType.ArrowClosed。

每次调用创建独立 Edge 和 marker 对象。数据模块不负责线型、箭头或颜色。

### 5.5 Mask 边界

继续按以下规则派生：

```text
boundaryY = getRowY(currentStartRowId) − 48
```

当前结果仍为 232。48 的边界留白保留在 graph；20% 不透明度及物理遮罩样式保持现有实现。

## 6. 内存状态与未来接入边界

依赖方向为：

```text
vision-database.ts：固定记录与记录类型
        ↓
vision-graph.ts：布局与 React Flow 转换
        ↓
Canvas / TaskNode / Mask：显示和内存交互
```

不允许数据模块反向导入 graph、组件或 React Flow，避免循环依赖。

初始化和重置通过转换函数重新创建初始图。拖动只更新 Canvas 的节点状态，不更新 tasks 数组，也不更新数据文件；刷新继续恢复初始图。

本轮模拟的是“记录来源与画布表示分开”的设计。未来接入数据库时，可以由真实记录替换当前固定数据来源，并按实际异步生命周期调整数据接入；本轮不预先承诺数据库接口和 Schema，也不假装静态 import 已实现异步查询。

不新增 Repository、Service、异步 Promise、加载状态、模拟 CRUD、事件总线或保存按钮。

## 7. 本轮范围与修改面

### 必需

| 文件 | 预计调整 |
|---|---|
| `vision-database.ts`（新增） | 定义纯记录类型；默认导出四条 tasks；具名导出 rows、connections、currentStartRowId |
| `vision-graph.ts` | 导入数据，移除重复 fixture，保留渲染类型、布局常量和转换函数 |

### 仅在类型接入需要时

既有组件 import 可通过 graph 的 type re-export 保持，优先不改组件。只有直接消费者因记录类型迁移必须调整时，才做最小 import 修改。

不修改 Task 卡片、CSS、i18n 文案、Mask 事件行为、Canvas 拖动规则、导航、页面外壳、静态路由、依赖或后端。

现有页面外壳的 workspace/MCP 请求不在本轮清理范围内；数据模块和图转换自身不新增请求、不依赖后端或数据库。

## 8. 后续实施与验证顺序

本节是实施指导，不代表当前已获产品代码修改授权。

1. 新增 vision-database.ts，迁移四条 Task、两条 Row、三条连接和当前起始行。
2. 调整 vision-graph.ts 使用导入记录，保持所有现有对外画布接口。
3. 核对行 Y、节点坐标、连接 ID、Mask 边界与原实现一致。
4. 核对初始创建和重置创建新对象，拖动不修改固定数据。
5. 对变更文件执行相关 lint/typecheck，人工验证页面外观和既有交互无变化。

这是低影响的数据组织调整，不要求为静态数组搬迁新增镜像测试，不要求全仓测试。已有直接相关测试如确有覆盖则按需执行。静态构建仅在实际影响需要时验证，不以 E2E/Playwright、CI、Git hooks 或发布为前置条件。

## 9. 验收标准

- [ ] vision-database.ts 默认导出 tasks，graph 使用 import tasks 消费。
- [ ] 四条 Task、两条 Row、三条连接和唯一当前起始行集中在该数据文件，无重复 fixture。
- [ ] 数据文件及其类型不导入 React、React Flow、后端模型或数据库依赖。
- [ ] Task 记录保留现有 id、titleKey、rowId、初始 x，不重复保存 Y 或 React Flow 状态。
- [ ] graph 负责生成 Node/Edge，保留渲染常量、行距、网格间距和 Mask 边界留白。
- [ ] 初始节点仍为 (0,0)、(720,0)、(1080,0)、(360,280)，Mask 边界仍为 232。
- [ ] 三条连接 ID 和 Task1 → Task4 → Task2 → Task3 关系保持不变。
- [ ] 初始化和重置产生新的节点、位置、data、Edge 和 marker 对象，运行时状态不回写导入记录。
- [ ] Row 无视觉、物理 Mask、水平吸附、Edge 跟随、视图控件、中英文和主题行为保持现状。
- [ ] 没有 API、数据库、异步查询、保存功能或示例图持久化；业务 API 不可用时固定数据仍可读取。
- [ ] 仅改数据文件、graph 及必要的类型 import，没有依赖或业务代码扩展。
- [ ] 相关 lint/typecheck 通过，git diff 无格式错误。

完成判定：数据记录入口与画布转换清晰分离，并保持现有 UI 和内存交互行为，才算本轮数据入口概念验证完成。当前仅完成方案文档。
