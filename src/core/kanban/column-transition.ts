/**
 * Column Transition — Event types and handler for Kanban column transitions.
 *
 * When a card moves between columns, a COLUMN_TRANSITION event is emitted.
 * The ColumnTransitionHandler listens for these events and triggers
 * the appropriate Column Agent based on KanbanColumnAutomation config.
 */

import { EventBus, AgentEventType, AgentEvent } from "../events/event-bus";
import type { KanbanBoard, KanbanColumn, KanbanColumnAutomation } from "../models/kanban";
import type { KanbanBoardStore } from "../store/kanban-board-store";

/** Data payload for COLUMN_TRANSITION events */
export interface ColumnTransitionData {
  cardId: string;
  cardTitle: string;
  boardId: string;
  workspaceId: string;
  fromColumnId: string;
  toColumnId: string;
  fromColumnName?: string;
  toColumnName?: string;
}

/**
 * Emit a COLUMN_TRANSITION event on the event bus.
 */
export function emitColumnTransition(
  eventBus: EventBus,
  data: ColumnTransitionData,
): void {
  const event: AgentEvent = {
    type: AgentEventType.COLUMN_TRANSITION,
    agentId: "kanban-system",
    workspaceId: data.workspaceId,
    data: data as unknown as Record<string, unknown>,
    timestamp: new Date(),
  };
  eventBus.emit(event);
}

/** Callback invoked when a column transition should trigger an agent */
export type TransitionTriggerCallback = (params: {
  workspaceId: string;
  boardId: string;
  cardId: string;
  cardTitle: string;
  columnId: string;
  columnName: string;
  automation: KanbanColumnAutomation;
}) => Promise<void>;

export function resolveTransitionAutomation(
  board: Pick<KanbanBoard, "columns">,
  data: ColumnTransitionData,
): { column: KanbanColumn; automation: KanbanColumnAutomation } | undefined {
  const sourceColumn = board.columns.find((column) => column.id === data.fromColumnId);
  const targetColumn = board.columns.find((column) => column.id === data.toColumnId);

  const sourceTransitionType = sourceColumn?.automation?.transitionType ?? "entry";
  if (
    sourceColumn?.automation?.enabled
    && (sourceTransitionType === "exit" || sourceTransitionType === "both")
  ) {
    return { column: sourceColumn, automation: sourceColumn.automation };
  }

  const targetTransitionType = targetColumn?.automation?.transitionType ?? "entry";
  if (
    targetColumn?.automation?.enabled
    && (targetTransitionType === "entry" || targetTransitionType === "both")
  ) {
    return { column: targetColumn, automation: targetColumn.automation };
  }

  return undefined;
}

/**
 * ColumnTransitionHandler — Listens for COLUMN_TRANSITION events and
 * triggers the configured Column Agent for the target column.
 */
export class ColumnTransitionHandler {
  private handlerKey = "kanban-column-transition-handler";

  constructor(
    private eventBus: EventBus,
    private kanbanBoardStore: KanbanBoardStore,
    private onTrigger: TransitionTriggerCallback,
  ) {}

  /** Start listening for column transition events */
  start(): void {
    this.eventBus.on(this.handlerKey, (event: AgentEvent) => {
      if (event.type !== AgentEventType.COLUMN_TRANSITION) return;
      void this.handleTransition(event);
    });
  }

  /** Stop listening */
  stop(): void {
    this.eventBus.off(this.handlerKey);
  }

  private async handleTransition(event: AgentEvent): Promise<void> {
    const data = event.data as unknown as ColumnTransitionData;
    const board = await this.kanbanBoardStore.get(data.boardId);
    if (!board) return;
    const resolved = resolveTransitionAutomation(board, data);
    if (!resolved) return;

    try {
      await this.onTrigger({
        workspaceId: data.workspaceId,
        boardId: data.boardId,
        cardId: data.cardId,
        cardTitle: data.cardTitle,
        columnId: resolved.column.id,
        columnName: resolved.column.name,
        automation: resolved.automation,
      });
    } catch (err) {
      console.error("[ColumnTransitionHandler] Failed to trigger agent:", err);
    }
  }
}
