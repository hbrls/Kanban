"use client";

import type { Locale } from "@/i18n";

export type KanbanSpecialistLanguage = "en" | "zh-CN";

export interface LocalizedSpecialistOption {
  id: string;
  name: string;
  role: string;
  displayName?: string;
  defaultProvider?: string;
}

export const KANBAN_SPECIALIST_LANGUAGE_LABELS: Record<
  KanbanSpecialistLanguage,
  {
    language: string;
    english: string;
    chinese: string;
    none: string;
    noSpecialist: string;
  }
> = {
  en: {
    language: "Language",
    english: "English",
    chinese: "Chinese",
    none: "None",
    noSpecialist: "No specialist",
  },
  "zh-CN": {
    language: "语言",
    english: "英文",
    chinese: "中文",
    none: "无",
    noSpecialist: "不指定 specialist",
  },
};

export function mapLocaleToKanbanSpecialistLanguage(locale: Locale): KanbanSpecialistLanguage {
  return locale === "zh" ? "zh-CN" : "en";
}

export function localizeSpecialists<T extends LocalizedSpecialistOption>(specialists: T[]): T[] {
  return specialists.map((specialist) => ({
    ...specialist,
    displayName: specialist.name,
  }));
}

export function findSpecialistById<T extends LocalizedSpecialistOption>(
  specialists: T[],
  id: string | undefined,
): T | undefined {
  if (!id) return undefined;
  return specialists.find((specialist) => specialist.id === id);
}

export function getLanguageSpecificSpecialistId(
  id: string | undefined,
  _language: KanbanSpecialistLanguage,
): string | undefined {
  return id;
}

export function resolveSpecialistSelection<T extends LocalizedSpecialistOption>(
  specialistId: string | undefined,
  specialistName: string | undefined,
  specialists: T[],
  _language: KanbanSpecialistLanguage,
): { specialistId?: string; specialistName?: string } {
  if (!specialistId && !specialistName) return {};
  const specialist = findSpecialistById(specialists, specialistId);
  return {
    specialistId: specialist?.id ?? specialistId,
    specialistName: specialist?.name ?? specialistName,
  };
}

export function getSpecialistDisplayName(
  specialist: Pick<LocalizedSpecialistOption, "name" | "displayName"> | null | undefined,
): string | undefined {
  if (!specialist) return undefined;
  return specialist.displayName ?? specialist.name;
}
