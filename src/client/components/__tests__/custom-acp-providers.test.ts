import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  hideProvider,
  isProviderHidden,
  loadHiddenProviders,
  saveHiddenProviders,
  showProvider,
  toggleProviderHidden,
} from "../../utils/custom-acp-providers";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
});

describe("custom-acp-providers hidden provider helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("round-trips hidden provider ids through the new storage key", () => {
    saveHiddenProviders(["kimi", "opencode", "kimi"]);

    expect(loadHiddenProviders()).toEqual(["kimi", "opencode"]);
    expect(localStorage.getItem("routa.hiddenProviders")).toBe(JSON.stringify(["kimi", "opencode"]));
    expect(localStorage.getItem("routa.disabledProviders")).toBe(JSON.stringify(["kimi", "opencode"]));
  });

  it("falls back to the legacy disabled key when the new key is missing", () => {
    localStorage.setItem("routa.disabledProviders", JSON.stringify(["claude"]));

    expect(loadHiddenProviders()).toEqual(["claude"]);
  });

  it("prefers the new hidden key when both keys are present", () => {
    localStorage.setItem("routa.hiddenProviders", JSON.stringify(["codex"]));
    localStorage.setItem("routa.disabledProviders", JSON.stringify(["claude"]));

    expect(loadHiddenProviders()).toEqual(["codex"]);
  });

  it("supports hide/show/toggle helpers", () => {
    hideProvider("opencode");
    expect(isProviderHidden("opencode")).toBe(true);

    expect(toggleProviderHidden("opencode")).toBe(true);
    expect(isProviderHidden("opencode")).toBe(false);

    expect(toggleProviderHidden("opencode")).toBe(false);
    expect(isProviderHidden("opencode")).toBe(true);

    showProvider("opencode");
    expect(isProviderHidden("opencode")).toBe(false);
  });
});
