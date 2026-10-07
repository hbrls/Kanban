/**
 * Vision data schema.
 *
 * This module defines the domain records that will guide the future database
 * design. It contains no sample records and no UI or persistence behavior.
 * Task layout is expressed only in grid coordinates; pixel positions are
 * derived at render time and never stored here.
 */

export interface VisionTaskRecord {
  readonly id: string;
  /**
   * 1-based grid row, counted from top to bottom. Rows may be shared by tasks.
   */
  readonly row: number;
  /**
   * 1-based grid column, counted from left to right. Each column may be used
   * by at most one task in a Vision graph, regardless of row. This is a design
   * rule for agents, not a runtime validation requirement.
   */
  readonly col: number;
  readonly title: string;
  readonly description: string;
  readonly acceptanceCriteria: ReadonlyArray<string>;
  /** Reserved for concise future metadata shown in the node footer. */
  readonly footer: string;
}

export interface VisionConnectionRecord {
  readonly id: string;
  /**
   * Vision flow edges are one-way from lower to higher Col. The current graph
   * is a single chain in Col order, without branches, backward edges, or
   * shortcuts over intermediate tasks.
   */
  readonly source: string;
  readonly target: string;
}

/**
 * Foreground mask boundary in grid coordinates. A grid area is masked when
 * `row < boundary.row || col < boundary.col` (union, not intersection).
 */
export interface VisionMaskBoundary {
  readonly row: number;
  readonly col: number;
}
