"use client";

import { useEffect, useRef } from "react";

import { SPREADSHEET_FONT_FAMILY } from "./spreadsheet-layout";
import type {
  SpreadsheetTableFilterTarget,
  SpreadsheetTableFilterValue,
} from "./spreadsheet-table-filters";

export type SpreadsheetTableFilterMenuAnchor = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export function SpreadsheetTableFilterMenu({
  anchor,
  onClear,
  onClose,
  onToggle,
  selectedValues,
  target,
  values,
}: {
  anchor: SpreadsheetTableFilterMenuAnchor;
  onClear: () => void;
  onClose: () => void;
  onToggle: (value: string, values: SpreadsheetTableFilterValue[]) => void;
  selectedValues?: string[];
  target: SpreadsheetTableFilterTarget;
  values: SpreadsheetTableFilterValue[];
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const node = event.target;
      if (node instanceof Node && menuRef.current?.contains(node)) return;
      onClose();
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const selected = new Set(selectedValues ?? values.map((item) => item.value));
  return (
    <div
      data-testid="spreadsheet-filter-menu"
      onPointerDown={(event) => event.stopPropagation()}
      ref={menuRef}
      style={{
        background: "#ffffff",
        borderColor: "#d7dde5",
        borderRadius: 8,
        borderStyle: "solid",
        borderWidth: 1,
        boxShadow: "0 18px 38px rgba(15, 23, 42, 0.18)",
        color: "#0f172a",
        fontFamily: SPREADSHEET_FONT_FAMILY,
        fontSize: 12,
        left: Math.max(8, anchor.left - 206),
        minWidth: 220,
        overflow: "hidden",
        position: "absolute",
        top: anchor.top + anchor.height + 4,
        zIndex: 50_000,
      }}
    >
      <div style={{ borderBottom: "1px solid #e2e8f0", fontWeight: 700, padding: "8px 10px" }}>
        {target.columnName}
      </div>
      <button
        onClick={onClear}
        style={{
          background: "transparent",
          border: 0,
          borderBottom: "1px solid #e2e8f0",
          color: "#2563eb",
          cursor: "pointer",
          display: "block",
          font: "inherit",
          padding: "7px 10px",
          textAlign: "left",
          width: "100%",
        }}
        type="button"
      >
        Clear filter
      </button>
      <div style={{ maxHeight: 260, overflow: "auto", padding: "6px 0" }}>
        {values.map((item) => (
          <label
            key={item.value}
            style={{
              alignItems: "center",
              cursor: "pointer",
              display: "flex",
              gap: 8,
              padding: "5px 10px",
            }}
          >
            <input
              checked={selected.has(item.value)}
              onChange={() => onToggle(item.value, values)}
              type="checkbox"
            />
            <span style={{ flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.label}
            </span>
            <span style={{ color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{item.count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
