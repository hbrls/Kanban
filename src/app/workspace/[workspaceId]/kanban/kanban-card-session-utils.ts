"use client";

import type { AutomationSpecialistResolver } from "@/core/kanban/effective-task-automation";
import type { TaskInfo } from "../types";
import { findSpecialistById, getSpecialistDisplayName } from "./kanban-specialist-language";

export interface KanbanSpecialistOption {
  id: string;
  name: string;
  role: string;
  displayName?: string;
  defaultProvider?: string;
}

export function getSpecialistName(
  specialistId: string | undefined,
  specialistName: string | undefined,
  specialists: KanbanSpecialistOption[],
): string {
  if (!specialistId && !specialistName) return "None";
  return getSpecialistDisplayName(findSpecialistById(specialists, specialistId)) ?? specialistName ?? specialistId ?? "None";
}

export function createKanbanSpecialistResolver(
  specialists: KanbanSpecialistOption[],
): AutomationSpecialistResolver {
  return (specialistId) => {
    const specialist = findSpecialistById(specialists, specialistId);
    if (!specialist) return undefined;
    return {
      name: getSpecialistDisplayName(specialist) ?? specialist.name,
      role: specialist.role,
      defaultProvider: specialist.defaultProvider,
    };
  };
}

export function formatSessionTimestamp(value: string | undefined): string {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return date.toLocaleString();
}

export function getOrderedSessionIds(task: TaskInfo): string[] {
  const laneSessions = task.laneSessions ?? [];
  return laneSessions.length > 0
    ? laneSessions.map((entry) => entry.sessionId)
    : Array.from(new Set([
        ...(task.sessionIds ?? []),
        ...(task.triggerSessionId ? [task.triggerSessionId] : []),
      ]));
}

export function getLaneSessionStepLabel(
  session: { stepIndex?: number; stepName?: string } | undefined,
): string | null {
  if (!session) return null;
  const stepName = session.stepName?.trim();
  if (stepName) return stepName;
  if (typeof session.stepIndex === "number") return `Step ${session.stepIndex + 1}`;
  return null;
}
