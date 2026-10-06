/**
 * Vision graph definition.
 *
 * Records come from ./vision-database (the simulated database read boundary);
 * this module owns the grid-to-canvas projection and converts records into
 * React Flow nodes and edges. All row/column layout decisions derive from the
 * same projection constants, so no independent pixel coordinates exist in the
 * domain data. Nothing here is backed by the Kanban model, any API, or
 * persistence — refreshing the page always restores this exact graph.
 */
import { MarkerType, type Edge, type Node } from "@xyflow/react";

import {
  connections,
  maskBoundary,
  tasks,
  VISION_COLUMN_STEP,
  VISION_ROW_STEP,
} from "./vision-database";

export interface VisionTaskNodeData extends Record<string, unknown> {
  title: string;
  description: string;
  acceptanceCriteria: ReadonlyArray<string>;
  footer: string;
  row: number;
}

export type VisionTaskNode = Node<VisionTaskNodeData, "task">;

export const VISION_TASK_NODE_WIDTH = 260;

/** Projects a 1-based grid row to its canvas Y coordinate. */
export function getGridRowY(row: number): number {
  return (row - 1) * VISION_ROW_STEP;
}

/** Projects a 1-based grid column to its canvas X coordinate. */
export function getGridColX(col: number): number {
  return (col - 1) * VISION_COLUMN_STEP;
}

/** Canvas X of the mask's vertical edge; grid columns left of it are masked. */
export function getMaskBoundaryX(): number {
  return getGridColX(maskBoundary.col);
}

/** Canvas Y of the mask's horizontal edge; grid rows above it are masked. */
export function getMaskBoundaryY(): number {
  return getGridRowY(maskBoundary.row);
}

/** Whether a grid cell lies inside the foreground mask region. */
export function isMaskedGridCell(row: number, col: number): boolean {
  return row < maskBoundary.row || col < maskBoundary.col;
}

export function createInitialNodes(): VisionTaskNode[] {
  return tasks.map((task) => ({
    id: task.id,
    type: "task",
    position: { x: getGridColX(task.col), y: getGridRowY(task.row) },
    data: {
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria,
      footer: task.footer,
      row: task.row,
    },
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
