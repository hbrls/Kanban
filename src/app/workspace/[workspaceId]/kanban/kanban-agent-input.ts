export const AGENT_REFRESH_BURST_DELAYS_MS = [1_000, 4_000, 8_000, 12_000] as const;
export { buildKanbanTaskAgentPrompt } from "./i18n/kanban-task-agent";

export function scheduleKanbanRefreshBurst(onRefresh: () => void): () => void {
  const timerIds = AGENT_REFRESH_BURST_DELAYS_MS.map((delay) => window.setTimeout(() => {
    onRefresh();
  }, delay));

  return () => {
    for (const timerId of timerIds) {
      window.clearTimeout(timerId);
    }
  };
}
