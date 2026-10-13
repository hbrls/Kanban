"use client";

import { use } from "react";
import { I18nContext, type I18nContextValue } from "./context";

export function useTranslation(): I18nContextValue {
  return use(I18nContext);
}
