import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { en } from "./en";
import type { TranslationKeys, Translations } from "./en";
import { pl } from "./pl";

export type Lang = "en" | "pl";

const dicts: Record<Lang, Translations> = { en, pl };

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(
    () => (localStorage.getItem("crashsite.lang") as Lang | null) ?? "en"
  );

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("crashsite.lang", l);
  };

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

export function useT() {
  const { lang } = useContext(LangContext);
  return useCallback(
    (key: TranslationKeys, params?: Record<string, string | number>): string => {
      let str: string = dicts[lang][key];
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang]
  );
}
