"use client";

import { type ComponentProps } from "react";
import { KanbanBoardSurface } from "./kanban-tab-panels";

type BoardSurfaceProps = ComponentProps<typeof KanbanBoardSurface>;

export function KanbanSwimlaneRow(props: BoardSurfaceProps) {
  return (
    <div className="flex min-h-0 flex-col" data-testid="kanban-swimlane-row">
      <KanbanBoardSurface {...props}/>
    </div>
  );
}
