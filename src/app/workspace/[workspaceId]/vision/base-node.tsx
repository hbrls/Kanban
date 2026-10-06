/**
 * Base Node components for the Vision canvas.
 *
 * Adapted from the official React Flow UI "base-node" registry component
 * (MIT licensed, xyflow):
 *   Source:  https://ui.reactflow.dev/base-node
 *   Docs:    https://reactflow.dev/ui/components/base-node
 *   Fetched: 2026-10-04
 *
 * Local adaptations:
 * - Replaced the shadcn `cn` helper with explicit className composition
 *   (this repo has no `@/lib/utils`).
 * - Mapped shadcn theme classes (`bg-card`, `text-card-foreground`,
 *   `border-muted-foreground`) to the existing desktop theme tokens.
 * - Replaced the non-standard `user-select-none` class with Tailwind's
 *   `select-none`.
 * - Selected/hover feedback is scoped through `vision.module.css` so other
 *   pages are unaffected.
 */
import type { ComponentProps } from "react";

import styles from "./vision.module.css";

function composeClassName(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function BaseNode({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={composeClassName(
        "relative rounded-md border bg-desktop-bg-secondary text-desktop-text-primary border-desktop-border",
        styles.baseNode,
        className,
      )}
      tabIndex={0}
      {...props}
    />
  );
}

export function BaseNodeHeader({ className, ...props }: ComponentProps<"header">) {
  return (
    <header
      {...props}
      className={composeClassName(
        "mx-0 my-0 -mb-1 flex flex-row items-center justify-between gap-2 px-3 py-2",
        className,
      )}
    />
  );
}

export function BaseNodeHeaderTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      data-slot="base-node-title"
      className={composeClassName("select-none flex-1 font-semibold", className)}
      {...props}
    />
  );
}

export function BaseNodeContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-content"
      className={composeClassName("flex flex-col gap-y-2 p-3", className)}
      {...props}
    />
  );
}

export function BaseNodeFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="base-node-footer"
      className={composeClassName(
        "flex flex-col items-center gap-y-2 border-t border-desktop-border px-3 pb-3 pt-2",
        className,
      )}
      {...props}
    />
  );
}
