"use client";

import { type ComponentProps } from "react";
import type { TaskInfo } from "../types";
import { KanbanAgentPanel, KanbanBoardSurface } from "./kanban-tab-panels";
import { KanbanSwimlaneRow } from "./kanban-swimlane-row";

type BoardSurfaceProps = ComponentProps<typeof KanbanBoardSurface>;

export interface SwimlaneGroup {
  key: string;
  tasks: TaskInfo[];
}

export function groupBySwimlane(boardTasks: TaskInfo[]): SwimlaneGroup[] {
  const sorted = boardTasks
    .slice()
    .sort((left, right) => {
      const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
      return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
    });

  return sorted.map((task) => ({
    key: task.id,
    tasks: [task],
  }));
}

export function KanbanSwimlaneContainer(props: BoardSurfaceProps) {
  const lanes = groupBySwimlane(props.boardTasks);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto pb-2" data-testid="kanban-swimlane-container">
        <div className="flex min-w-max flex-1 flex-col gap-4">
          {lanes.length === 0 ? (
            <KanbanBoardSurface {...props} boardTasks={[]}/>
          ) : (
            lanes.map((lane) => (
              <KanbanSwimlaneRow
                key={lane.key}
                {...props}
                boardTasks={lane.tasks}
              />
            ))
          )}
        </div>
      </div>
      {props.agentPanelOpen && props.agentSessionId && props.acp && (
        <KanbanAgentPanel
          agentSessionId={props.agentSessionId}
          agentSession={props.agentSession}
          acp={props.acp}
          workspaceId={props.workspaceId}
          boardAutoProviderId={props.boardAutoProviderId}
          kanbanTaskAgentCopy={props.kanbanTaskAgentCopy}
          openAgentPanel={props.openAgentPanel}
          onCloseAgentPanel={props.onCloseAgentPanel}
          ensureKanbanAgentSession={props.ensureKanbanAgentSession}
          kanbanRepoSelection={props.kanbanRepoSelection}
          codebases={props.codebases}
        />
      )}
    </div>
  );
}
