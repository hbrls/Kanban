"use client";

import { useMemo, useSyncExternalStore } from "react";

import type { SpreadsheetViewportScroll, SpreadsheetViewportSize } from "./spreadsheet-layout";

export type SpreadsheetViewportState = {
  scroll: SpreadsheetViewportScroll;
  size: SpreadsheetViewportSize;
};

type SpreadsheetViewportListener = () => void;

const EMPTY_VIEWPORT_STATE: SpreadsheetViewportState = {
  scroll: { left: 0, top: 0 },
  size: { height: 0, width: 0 },
};

export type SpreadsheetViewportStore = {
  cancelPending(): void;
  destroy(): void;
  getSnapshot(): SpreadsheetViewportState;
  reset(): void;
  schedule(next: SpreadsheetViewportState): void;
  subscribe(listener: SpreadsheetViewportListener): () => void;
};

export function createSpreadsheetViewportStore(): SpreadsheetViewportStore {
  let snapshot = EMPTY_VIEWPORT_STATE;
  let pending: SpreadsheetViewportState | null = null;
  let frame: number | null = null;
  const listeners = new Set<SpreadsheetViewportListener>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const apply = (next: SpreadsheetViewportState) => {
    if (spreadsheetViewportStateEquals(snapshot, next)) return;
    snapshot = next;
    emit();
  };

  const flush = () => {
    frame = null;
    const next = pending;
    pending = null;
    if (next) apply(next);
  };

  const cancelPending = () => {
    pending = null;
    if (frame != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(frame);
    }
    frame = null;
  };

  return {
    cancelPending,
    destroy: () => {
      cancelPending();
      listeners.clear();
    },
    getSnapshot: () => snapshot,
    reset: () => {
      cancelPending();
      apply(EMPTY_VIEWPORT_STATE);
    },
    schedule: (next) => {
      pending = next;
      if (typeof window === "undefined") {
        flush();
        return;
      }

      if (frame == null) {
        frame = window.requestAnimationFrame(flush);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useSpreadsheetViewportStore(): {
  state: SpreadsheetViewportState;
  store: SpreadsheetViewportStore;
} {
  const store = useMemo(() => createSpreadsheetViewportStore(), []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { state, store };
}

function spreadsheetViewportStateEquals(
  left: SpreadsheetViewportState,
  right: SpreadsheetViewportState,
): boolean {
  return left.scroll.left === right.scroll.left &&
    left.scroll.top === right.scroll.top &&
    left.size.height === right.size.height &&
    left.size.width === right.size.width;
}
