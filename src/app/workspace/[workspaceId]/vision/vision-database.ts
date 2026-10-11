/**
 * Vision static records and grid configuration.
 *
 * This module is the simulated database read boundary: it maps a workspace id
 * to that workspace's canvas record and owns the cross-workspace grid layout
 * constants. No API, no persistence, no database access; record shapes are
 * defined in ./vision-schema.ts. Unknown workspace ids resolve to the shared
 * empty database instead of falling back to another workspace's data.
 */

import { ARKNIGHTS_VISION_DATABASE } from "./vision-database-arknights";
import { ROUTA_VISION_DATABASE } from "./vision-database-routa";
import type { VisionDatabaseRecord } from "./vision-schema";

/** Dotted background grid size in canvas units; purely visual, not a layout step. */
export const VISION_BACKGROUND_GRID_SIZE = 24;

/** Horizontal step between neighboring grid columns, in canvas units. */
export const VISION_COLUMN_STEP = 360;

/** Vertical step between neighboring grid rows, in canvas units. */
export const VISION_ROW_STEP = 280;

/** Workspace ids or titles map to their canvas record; keys are normalized. */
export const VISION_DATABASES: ReadonlyMap<string, VisionDatabaseRecord> = new Map([
  ["arknights", ARKNIGHTS_VISION_DATABASE],
  ["routa", ROUTA_VISION_DATABASE],
]);

/** Empty canvas used for unregistered workspaces; never falls back. */
export const EMPTY_VISION_DATABASE: VisionDatabaseRecord = {
  tasks: [],
  connections: [],
  maskBoundary: { row: 1, col: 1 },
};

/**
 * Normalizes a lookup key: real workspace ids are UUIDs while the registered
 * keys use human-readable names, so both id and title are matched
 * case-insensitively against the same normalized map.
 */
function normalizeVisionDatabaseKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Simulated query: returns the canvas record registered under the workspace
 * id or the workspace title; unregistered workspaces resolve to the shared
 * empty database instead of another workspace's data.
 */
export function getVisionDatabase(
  workspaceId: string,
  workspaceTitle?: string | null,
): VisionDatabaseRecord {
  const byId = VISION_DATABASES.get(normalizeVisionDatabaseKey(workspaceId));
  if (byId) return byId;
  if (workspaceTitle) {
    const byTitle = VISION_DATABASES.get(normalizeVisionDatabaseKey(workspaceTitle));
    if (byTitle) return byTitle;
  }
  return EMPTY_VISION_DATABASE;
}
