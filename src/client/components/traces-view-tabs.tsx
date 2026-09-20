"use client";

import React from "react";
import { useTranslation } from "@/i18n";
import { Button } from "./button";

export type TraceViewTab = "chat" | "event-bridge";

interface TracesViewTabsProps {
  activeTab: TraceViewTab;
  onTabChange: (tab: TraceViewTab) => void;
  className?: string;
}

const TAB_DEFINITIONS: Array<{ key: TraceViewTab; label: string; color: string }> = [
  { key: "chat", label: "traces:chat", color: "bg-desktop-trace-chat" },
  { key: "event-bridge", label: "traces:traceTab", color: "bg-desktop-trace-event-bridge" },
];

export function TracesViewTabs({ activeTab, onTabChange, className }: TracesViewTabsProps) {
  const { t } = useTranslation();
  return (
    <div className={className ?? ""}>
      <div
        className="inline-flex items-center rounded-md border border-desktop-border bg-desktop-bg-secondary p-0.5"
        data-testid="traces-view-tabs"
      >
        {TAB_DEFINITIONS.map(({ key, label: _label, color }) => (
          <Button
            key={key}
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onTabChange(key)}
            className={`rounded-none px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-all ${
              activeTab === key
                ? `${color} text-desktop-accent-text`
                : "text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
            }`}
          >
            {key === "chat" ? t.traces.chat : t.traces.traceTab}
          </Button>
        ))}
      </div>
    </div>
  );
}
