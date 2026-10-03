import type {
  KanbanDevSessionCompletionRequirement,
  KanbanDevSessionSupervision,
  KanbanDevSessionSupervisionMode,
} from "../models/kanban";

const DEFAULT_KANBAN_DEV_SESSION_SUPERVISION: KanbanDevSessionSupervision = {
  mode: "watchdog_retry",
  inactivityTimeoutMinutes: 10,
  maxRecoveryAttempts: 1,
  completionRequirement: "turn_complete",
};

const VALID_MODES = new Set<KanbanDevSessionSupervisionMode>([
  "disabled",
  "watchdog_retry",
  "ralph_loop",
]);

const VALID_COMPLETION_REQUIREMENTS = new Set<KanbanDevSessionCompletionRequirement>([
  "turn_complete",
  "completion_summary",
  "verification_report",
]);

function metadataKey(boardId: string): string {
  return `kanbanDevSessionSupervision:${boardId}`;
}

function normalizeMode(value: unknown): KanbanDevSessionSupervisionMode {
  return VALID_MODES.has(value as KanbanDevSessionSupervisionMode)
    ? value as KanbanDevSessionSupervisionMode
    : DEFAULT_KANBAN_DEV_SESSION_SUPERVISION.mode;
}

function normalizeCompletionRequirement(value: unknown): KanbanDevSessionCompletionRequirement {
  return VALID_COMPLETION_REQUIREMENTS.has(value as KanbanDevSessionCompletionRequirement)
    ? value as KanbanDevSessionCompletionRequirement
    : DEFAULT_KANBAN_DEV_SESSION_SUPERVISION.completionRequirement;
}

function normalizeMinutes(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_KANBAN_DEV_SESSION_SUPERVISION.inactivityTimeoutMinutes;
  }
  return Math.min(120, Math.max(1, Math.floor(parsed)));
}

function normalizeAttempts(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_KANBAN_DEV_SESSION_SUPERVISION.maxRecoveryAttempts;
  }
  return Math.min(10, Math.max(0, Math.floor(parsed)));
}

export function normalizeKanbanDevSessionSupervision(
  config: Partial<KanbanDevSessionSupervision> | undefined,
): KanbanDevSessionSupervision {
  return {
    mode: normalizeMode(config?.mode),
    inactivityTimeoutMinutes: normalizeMinutes(config?.inactivityTimeoutMinutes),
    maxRecoveryAttempts: normalizeAttempts(config?.maxRecoveryAttempts),
    completionRequirement: normalizeCompletionRequirement(config?.completionRequirement),
  };
}

export function getKanbanDevSessionSupervision(
  metadata: Record<string, string> | undefined,
  boardId: string,
): KanbanDevSessionSupervision {
  const raw = metadata?.[metadataKey(boardId)];
  if (!raw) {
    return { ...DEFAULT_KANBAN_DEV_SESSION_SUPERVISION };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<KanbanDevSessionSupervision>;
    return normalizeKanbanDevSessionSupervision(parsed);
  } catch {
    return { ...DEFAULT_KANBAN_DEV_SESSION_SUPERVISION };
  }
}

export function setKanbanDevSessionSupervision(
  metadata: Record<string, string> | undefined,
  boardId: string,
  config: Partial<KanbanDevSessionSupervision> | undefined,
): Record<string, string> {
  const normalized = normalizeKanbanDevSessionSupervision(config);
  return {
    ...(metadata ?? {}),
    [metadataKey(boardId)]: JSON.stringify(normalized),
  };
}

export function getDefaultKanbanDevSessionSupervision(): KanbanDevSessionSupervision {
  return { ...DEFAULT_KANBAN_DEV_SESSION_SUPERVISION };
}
