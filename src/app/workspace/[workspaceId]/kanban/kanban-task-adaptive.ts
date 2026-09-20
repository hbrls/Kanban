import type { AcpTaskAdaptiveHarnessOptions } from "@/client/acp-client";
import {
  buildKanbanTaskAdaptiveHarnessOptions as buildCoreKanbanTaskAdaptiveHarnessOptions,
} from "@/core/kanban/task-adaptive";
import type { TaskInfo } from "../types";

export const buildKanbanTaskAdaptiveHarnessOptions = (
  promptLabel: string,
  options: {
    locale?: string;
    role?: string;
    taskType?: AcpTaskAdaptiveHarnessOptions["taskType"];
    task?: TaskInfo | null;
  },
): AcpTaskAdaptiveHarnessOptions | undefined => {
  return buildCoreKanbanTaskAdaptiveHarnessOptions(promptLabel, options);
};
