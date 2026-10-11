/**
 * Routa workspace Vision canvas records: an empty canvas.
 */

import type { VisionDatabaseRecord } from "./vision-schema";

export const ROUTA_VISION_DATABASE: VisionDatabaseRecord = {
  tasks: [],
  connections: [],
  maskBoundary: { row: 1, col: 1 },
};
