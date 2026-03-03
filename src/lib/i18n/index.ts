"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import React from "react";
import fr from "./fr";
import en from "./en";

const translations: Record<string, Record<string, string>> = { fr, en };

interface I18nContextType {
  t: (key: string, params?: Record<string, string | number>) => string;
  lang: string;
  setLang: (l: string) => void;
}

const I18nContext = createContext<I18nContextType>({
  t: (key) => key,
  lang: "fr",
  setLang: () => {},
});

export function I18nProvider({ children, initialLang = "fr" }: { children: ReactNode; initialLang?: string }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((l: string) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      localStorage.setItem("flowtime_lang", l);
      document.documentElement.lang = l;
    }
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = translations[lang] || translations.fr;
    let str = dict[key] || translations.fr[key] || key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  }, [lang]);

  return React.createElement(I18nContext.Provider, { value: { t, lang, setLang } }, children);
}

export function useTranslation() {
  return useContext(I18nContext);
}
