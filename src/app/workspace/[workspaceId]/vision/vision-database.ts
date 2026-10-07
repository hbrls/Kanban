/**
 * Vision static records and grid configuration.
 *
 * This module contains sample data and static configuration only. Record
 * shapes are defined in ./vision-schema.ts so this file can later be replaced
 * by a database adapter without moving the domain model. No API, no
 * persistence, no database access.
 */

import type {
  VisionConnectionRecord,
  VisionMaskBoundary,
  VisionTaskRecord,
} from "./vision-schema";

/** Dotted background grid size in canvas units; purely visual, not a layout step. */
export const VISION_BACKGROUND_GRID_SIZE = 24;

/** Horizontal step between neighboring grid columns, in canvas units. */
export const VISION_COLUMN_STEP = 360;

/** Vertical step between neighboring grid rows, in canvas units. */
export const VISION_ROW_STEP = 280;

/** Grid areas with `row < 2` or `col < 2` are covered by the foreground mask. */
export const maskBoundary = {
  row: 2,
  col: 2,
} as const satisfies VisionMaskBoundary;

export const tasks = [
  {
    id: "vision-task-1",
    row: 1,
    col: 1,
    title: "Define requirements",
    description: "Clarify goals, scope, and acceptance criteria.",
    acceptanceCriteria: ["Goals defined", "Scope agreed", "Acceptance criteria recorded"],
    footer: "Planning",
  },
  {
    id: "vision-task-2",
    row: 4,
    col: 2,
    title: "国内版抖音小游戏选型",
    description: "基于 preset-cocos 完成一个可演示的小游戏。",
    acceptanceCriteria: ["小游戏完成", "可以演示"],
    footer: "Plus 验收",
  },
  {
    id: "vision-task-3",
    row: 2,
    col: 3,
    title: "完成框架选型",
    description: "选型目标：使用 Cocos Creator 生成的 H5 小游戏。",
    acceptanceCriteria: [
      "生态良好",
      "支持 TikTok 上架",
      "TikTok 广告接入生态良好",
    ],
    footer: "框架选型",
  },
  {
    id: "vision-task-4",
    row: 2,
    col: 4,
    title: "完成项目 preset-cocos",
    description:
      "preset-x 有独立的验收标准，可由其他 Agent 处理；本任务只负责记录并验收。",
    acceptanceCriteria: ["能开发", "能构建", "Plus：能演示一个小游戏"],
    footer: "基础验收 + Plus",
  },
  {
    id: "vision-task-5",
    row: 3,
    col: 5,
    title: "初始化 preset-cocos 项目",
    description: "为 preset-cocos 建立可开发、可构建的项目基础。",
    acceptanceCriteria: ["项目初始化完成", "项目可以开发和构建"],
    footer: "preset-cocos 初始化",
  },
  {
    id: "vision-task-6",
    row: 3,
    col: 6,
    title: "完成小游戏",
    description: "基于 preset-cocos 完成一个可演示的小游戏。",
    acceptanceCriteria: ["小游戏完成", "可以演示"],
    footer: "Plus 验收",
  },
  {
    id: "vision-task-7",
    row: 1,
    col: 7,
    title: "Design the solution",
    description: "Define the architecture, components, and implementation steps.",
    acceptanceCriteria: ["Architecture selected", "Components defined", "Implementation steps documented"],
    footer: "Design",
  },
  {
    id: "vision-task-8",
    row: 1,
    col: 8,
    title: "在 TikTok 上发布小程序游戏，并接入广告收益",
    description: "完成小程序游戏从技术选型、开发发布到广告变现和上架的完整交付。",
    acceptanceCriteria: [
      "技术选型完成",
      "开发和发布流水线完成",
      "接入广告系统",
      "上架",
    ],
    footer: "Release target",
  },
] satisfies ReadonlyArray<VisionTaskRecord>;

export const connections = [
  { id: "vision-edge-1", source: "vision-task-1", target: "vision-task-2" },
  { id: "vision-edge-8", source: "vision-task-2", target: "vision-task-3" },
  { id: "vision-edge-2", source: "vision-task-3", target: "vision-task-4" },
  { id: "vision-edge-4", source: "vision-task-4", target: "vision-task-5" },
  { id: "vision-edge-5", source: "vision-task-5", target: "vision-task-6" },
  { id: "vision-edge-6", source: "vision-task-6", target: "vision-task-7" },
  { id: "vision-edge-3", source: "vision-task-7", target: "vision-task-8" },
] satisfies ReadonlyArray<VisionConnectionRecord>;
