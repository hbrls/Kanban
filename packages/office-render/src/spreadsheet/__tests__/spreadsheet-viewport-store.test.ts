import { afterEach, describe, expect, it, vi } from "vitest";

import { createSpreadsheetViewportStore } from "../spreadsheet-viewport-store";

describe("spreadsheet viewport store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("coalesces viewport updates into one animation frame snapshot", () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);

    const store = createSpreadsheetViewportStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.schedule({ scroll: { left: 10, top: 20 }, size: { height: 100, width: 200 } });
    store.schedule({ scroll: { left: 30, top: 40 }, size: { height: 120, width: 220 } });

    expect(listener).not.toHaveBeenCalled();
    expect(callbacks).toHaveLength(1);

    callbacks[0]!(0);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({
      scroll: { left: 30, top: 40 },
      size: { height: 120, width: 220 },
    });
  });

  it("resets and cancels pending viewport updates", () => {
    const callbacks: FrameRequestCallback[] = [];
    const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      return 9;
    });

    const store = createSpreadsheetViewportStore();
    store.schedule({ scroll: { left: 10, top: 20 }, size: { height: 100, width: 200 } });
    store.reset();

    expect(cancel).toHaveBeenCalledWith(9);
    expect(store.getSnapshot()).toEqual({
      scroll: { left: 0, top: 0 },
      size: { height: 0, width: 0 },
    });
  });
});
