/**
 * Vision graph definition.
 *
 * Records come from ./vision-database (the simulated database read boundary);
 * this module owns the layout rules and converts records into React Flow
 * nodes and edges. Nothing here is backed by the Kanban model, any API, or
 * persistence — refreshing the page always restores this exact graph.
 */
import { MarkerType, type Edge, type Node } from "@xyflow/react";

import {
  connections,
  currentStartRowId,
  rows,
  tasks,
  type VisionRowId,
  type VisionTaskTitleKey,
} from "./vision-database";

export type { VisionRowId, VisionTaskTitleKey };

export interface VisionTaskNodeData extends Record<string, unknown> {
  titleKey: VisionTaskTitleKey;
  rowId: VisionRowId;
}

export type VisionTaskNode = Node<VisionTaskNodeData, "task">;

export const VISION_TASK_NODE_WIDTH = 220;

/** Horizontal grid step in canvas units; matches the dotted background gap. */
export const VISION_GRID_SIZE = 24;

/** Fixed vertical distance between logical rows, in canvas units. */
const VISION_ROW_SPACING = 280;

const ROW_ORDER_BY_ID: ReadonlyMap<VisionRowId, number> = new Map(
  rows.map((row) => [row.id, row.order]),
);

export function getRowY(rowId: VisionRowId): number {
  return (ROW_ORDER_BY_ID.get(rowId) ?? 0) * VISION_ROW_SPACING;
}

/** The row where the "current" region starts; every row above it is "past". */
export const CURRENT_START_ROW_ID: VisionRowId = currentStartRowId;

/** Gap in canvas units between the past mask boundary and the current start row. */
export const PAST_BOUNDARY_INSET = 48;

/** Canvas Y of the zero-thickness logical boundary between past and current. */
export function getPastBoundaryY(): number {
  return getRowY(CURRENT_START_ROW_ID) - PAST_BOUNDARY_INSET;
}

export function createInitialNodes(): VisionTaskNode[] {
  return tasks.map((task) => ({
    id: task.id,
    type: "task",
    position: { x: task.x, y: getRowY(task.rowId) },
    data: { titleKey: task.titleKey, rowId: task.rowId },
  }));
}

export function createInitialEdges(): Edge[] {
  return connections.map((connection) => ({
    id: connection.id,
    source: connection.source,
    target: connection.target,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed },
  }));
}
