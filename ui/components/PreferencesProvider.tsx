"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  browserLocale,
  type Locale,
  type ThemePreference,
} from "@/lib/i18n/locale";

const THEME_CACHE_KEY = "fh_theme_cache";
const LANG_CACHE_KEY = "fh_lang_cache";

export type MePreferences = {
  user_id: string;
  email: string;
  language: Locale;
  theme: ThemePreference;
  language_stored: string | null;
  theme_stored: string | null;
};

type PreferencesContextValue = {
  ready: boolean;
  locale: Locale;
  theme: ThemePreference;
  me: MePreferences | null;
  setLanguage: (language: Locale) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  refresh: () => Promise<void>;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function resolveDarkClass(theme: ThemePreference): boolean {
  if (theme === "dark") return true;
  if (theme === "light") return false;
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyDom(locale: Locale, theme: ThemePreference) {
  const root = document.documentElement;
  root.lang = locale;
  root.classList.remove("light", "dark");
  if (theme === "light") {
    root.classList.add("light");
  } else if (theme === "dark") {
    root.classList.add("dark");
  } else if (resolveDarkClass("system")) {
    root.classList.add("dark");
  }
  try {
    localStorage.setItem(LANG_CACHE_KEY, locale);
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [me, setMe] = useState<MePreferences | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const fallback = browserLocale();
        setMe(null);
        setLocale(fallback);
        setThemeState("system");
        applyDom(fallback, "system");
        return;
      }
      const data = (await response.json()) as {
        user_id?: string;
        email?: string;
        language?: string;
        theme?: string;
        language_stored?: string | null;
        theme_stored?: string | null;
      };
      const nextLocale: Locale = data.language === "es" ? "es" : "en";
      const nextTheme: ThemePreference =
        data.theme === "light" || data.theme === "dark" || data.theme === "system"
          ? data.theme
          : "system";
      setMe({
        user_id: data.user_id ?? "",
        email: data.email ?? "",
        language: nextLocale,
        theme: nextTheme,
        language_stored: data.language_stored ?? null,
        theme_stored: data.theme_stored ?? null,
      });
      setLocale(nextLocale);
      setThemeState(nextTheme);
      applyDom(nextLocale, nextTheme);
    } catch {
      const fallback = browserLocale();
      setLocale(fallback);
      setThemeState("system");
      applyDom(fallback, "system");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Hydrate from account API after mount (SoT is server, not localStorage).
    const handle = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyDom(locale, "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, locale]);

  const setLanguage = useCallback(async (language: Locale) => {
    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ language }),
    });
    if (!response.ok) {
      throw new Error("Failed to save language");
    }
    const data = (await response.json()) as {
      language?: string;
      theme?: string;
      user_id?: string;
      email?: string;
      language_stored?: string | null;
      theme_stored?: string | null;
    };
    const nextLocale: Locale = data.language === "es" ? "es" : "en";
    const nextTheme: ThemePreference =
      data.theme === "light" || data.theme === "dark" || data.theme === "system"
        ? data.theme
        : "system";
    setLocale(nextLocale);
    setThemeState(nextTheme);
    setMe({
      user_id: data.user_id ?? "",
      email: data.email ?? "",
      language: nextLocale,
      theme: nextTheme,
      language_stored: data.language_stored ?? null,
      theme_stored: data.theme_stored ?? null,
    });
    applyDom(nextLocale, nextTheme);
  }, []);

  const setTheme = useCallback(
    async (next: ThemePreference) => {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ theme: next }),
      });
      if (!response.ok) {
        throw new Error("Failed to save theme");
      }
      const data = (await response.json()) as {
        language?: string;
        theme?: string;
        user_id?: string;
        email?: string;
        language_stored?: string | null;
        theme_stored?: string | null;
      };
      const nextLocale: Locale = data.language === "es" ? "es" : "en";
      const nextTheme: ThemePreference =
        data.theme === "light" || data.theme === "dark" || data.theme === "system"
          ? data.theme
          : "system";
      setLocale(nextLocale);
      setThemeState(nextTheme);
      setMe({
        user_id: data.user_id ?? "",
        email: data.email ?? "",
        language: nextLocale,
        theme: nextTheme,
        language_stored: data.language_stored ?? null,
        theme_stored: data.theme_stored ?? null,
      });
      applyDom(nextLocale, nextTheme);
    },
    [],
  );

  const value = useMemo(
    () => ({
      ready,
      locale,
      theme,
      me,
      setLanguage,
      setTheme,
      refresh,
    }),
    [ready, locale, theme, me, setLanguage, setTheme, refresh],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}

/** Inline FOUC script — cache only; account API remains source of truth. */
export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_CACHE_KEY}')||'system';var l=localStorage.getItem('${LANG_CACHE_KEY}');var r=document.documentElement;if(l==='en'||l==='es'){r.lang=l;}r.classList.remove('light','dark');if(t==='light'){r.classList.add('light');}else if(t==='dark'){r.classList.add('dark');}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){r.classList.add('dark');}}catch(e){}})();`;
