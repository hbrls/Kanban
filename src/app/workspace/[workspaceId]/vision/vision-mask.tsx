"use client";

/**
 * Unified foreground mask for the Vision canvas.
 *
 * One SVG overlay above the React Flow content draws a single continuous
 * L-shaped path covering every grid area where `row < boundary.row ||
 * col < boundary.col`. The path itself is a pointer-events target, so the
 * masked region swallows mouse input (drag, pan, wheel) before it can reach
 * the nodes, edges or canvas beneath it. The transparent remainder of the
 * overlay passes events straight through to React Flow. The L-shape geometry
 * is derived from the mask boundary and the shared row/column projection
 * constants, projected through the current viewport, and extends far enough
 * to stay continuous across the whole visible area at any pan/zoom.
 */
import { useViewport } from "@xyflow/react";

import { getMaskBoundaryX, getMaskBoundaryY } from "./vision-graph";
import styles from "./vision.module.css";

/** Path extent well beyond any reachable viewport size; the SVG clips it. */
const MASK_EXTENT = 100000;

export function VisionMask() {
  const { x, y, zoom } = useViewport();
  const leftEdge = x + getMaskBoundaryX() * zoom;
  const topEdge = y + getMaskBoundaryY() * zoom;
  const d = `M 0 0 H ${MASK_EXTENT} V ${topEdge} H ${leftEdge} V ${MASK_EXTENT} H 0 Z`;

  return (
    <svg className={`${styles.maskOverlay} nodrag nopan nowheel`} aria-hidden="true">
      <path className={styles.maskPath} d={d} />
    </svg>
  );
}
