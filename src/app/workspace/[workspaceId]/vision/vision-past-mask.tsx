"use client";

/**
 * Physical foreground mask covering the "past" region of the Vision canvas.
 *
 * It lives in screen coordinates (not in the transformed node layer), spans
 * the full visible canvas width, and extends from the top of the canvas down
 * to the logical past/current boundary projected through the viewport. It
 * receives pointer events itself (`nodrag nopan nowheel` block React Flow's
 * pan/drag/wheel handling) so past tasks and the canvas beneath it cannot be
 * interacted with through the mask.
 */
import { useViewport } from "@xyflow/react";

import { getPastBoundaryY } from "./vision-graph";
import styles from "./vision.module.css";

export function VisionPastMask() {
  const { y, zoom } = useViewport();
  const height = Math.max(0, y + getPastBoundaryY() * zoom);

  return (
    <div
      className={`${styles.pastMask} nodrag nopan nowheel`}
      style={{ height }}
      aria-hidden="true"
    />
  );
}
