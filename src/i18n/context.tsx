"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { TranslationDictionary, Locale } from "./types";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
} from "./types";
import en from "./locales/en";
import zh from "./locales/zh";

const dictionaries: Record<Locale, TranslationDictionary> = { en, zh };
const LOCALE_CHANGE_EVENT = "routa:locale-changed";
let volatileLocaleOverride: Locale | null = null;

function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const lang = navigator.language?.toLowerCase() ?? "";
  if (lang.startsWith("zh")) return "zh";
  return DEFAULT_LOCALE;
}

function loadStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getPreferredLocale(): Locale {
  return volatileLocaleOverride ?? loadStoredLocale() ?? detectBrowserLocale();
}

function getServerLocaleSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

function subscribeToLocaleChange(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleLocaleChange = () => {
    onStoreChange();
  };

  window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange as EventListener);
  window.addEventListener("storage", handleLocaleChange);

  return () => {
    window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange as EventListener);
    window.removeEventListener("storage", handleLocaleChange);
  };
}

function persistLocale(locale: Locale): boolean {
  if (typeof window === "undefined") return false;

  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslationDictionary;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: dictionaries[DEFAULT_LOCALE],
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribeToLocaleChange,
    getPreferredLocale,
    getServerLocaleSnapshot,
  );

  const setLocale = useCallback((newLocale: Locale) => {
    volatileLocaleOverride = persistLocale(newLocale) ? null : newLocale;

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale: newLocale } }));
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <I18nContext value={{
      locale,
      setLocale,
      t: dictionaries[locale],
    }}>
      {children}
    </I18nContext>
  );
}
