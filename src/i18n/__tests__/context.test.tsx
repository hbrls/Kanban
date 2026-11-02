import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../context";
import en from "../locales/en";
import zh from "../locales/zh";
import { useTranslation } from "../use-translation";
import { LOCALE_STORAGE_KEY } from "../types";

function Probe() {
  const { locale, t } = useTranslation();

  return (
    <>
      <div data-testid="locale">{locale}</div>
      <div data-testid="subtitle">{t.home.subtitle}</div>
    </>
  );
}

describe("I18nProvider", () => {
  const originalNavigatorLanguage = navigator.language;
  const originalLocalStorage = window.localStorage;
  let storageState = new Map<string, string>();

  const mockLocalStorage = {
    getItem: (key: string) => storageState.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageState.set(key, value);
    },
    removeItem: (key: string) => {
      storageState.delete(key);
    },
  };

  beforeEach(() => {
    storageState = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: mockLocalStorage,
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "zh-CN",
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: originalNavigatorLanguage,
    });
  });

  it("uses the default locale during server rendering", () => {
    mockLocalStorage.setItem(LOCALE_STORAGE_KEY, "zh");

    const html = renderToString(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(html).toContain(">en<");
    expect(html).toContain(en.home.subtitle);
  });

  it("applies the preferred client locale after mount", async () => {
    mockLocalStorage.setItem(LOCALE_STORAGE_KEY, "zh");

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("locale").textContent).toBe("zh");
      expect(screen.getByTestId("subtitle").textContent).toBe(zh.home.subtitle);
      expect(document.documentElement.lang).toBe("zh");
    });
  });
});
