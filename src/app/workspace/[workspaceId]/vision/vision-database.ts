/**
 * Vision fixed data records.
 *
 * Static TypeScript data module that simulates the future database read
 * boundary. It only expresses records and their relationships — no React,
 * React Flow, persistence, network access, or query service. Refreshing the
 * page always restores these exact records.
 */

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
  /** Initial canvas X; Y is derived from the row order, not stored here. */
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

export const tasks: ReadonlyArray<VisionTaskRecord> = [
  { id: "vision-task-1", titleKey: "defineRequirements", rowId: "row-1", x: 0 },
  { id: "vision-task-2", titleKey: "designSolution", rowId: "row-1", x: 720 },
  { id: "vision-task-3", titleKey: "validateDelivery", rowId: "row-1", x: 1080 },
  { id: "vision-task-4", titleKey: "coordinateIntegration", rowId: "row-2", x: 360 },
];

export const rows: ReadonlyArray<VisionRowRecord> = [
  { id: "row-1", order: 0 },
  { id: "row-2", order: 1 },
];

export const connections: ReadonlyArray<VisionConnectionRecord> = [
  { id: "vision-edge-1", source: "vision-task-1", target: "vision-task-4" },
  { id: "vision-edge-2", source: "vision-task-4", target: "vision-task-2" },
  { id: "vision-edge-3", source: "vision-task-2", target: "vision-task-3" },
];

/** The row where the "current" region starts; every row above it is "past". */
export const currentStartRowId: VisionRowId = "row-2";
