"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/** Bumped on sign-out / password-reset so in-flight GET refresh cannot rewrite cache. */
let prefsSessionEpoch = 0;
let prefsCacheWritesAllowed = true;

export function clearPrefsCache() {
  prefsSessionEpoch += 1;
  prefsCacheWritesAllowed = false;
  try {
    localStorage.removeItem(LANG_CACHE_KEY);
    localStorage.removeItem(THEME_CACHE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export type MePreferences = {
  user_id: string;
  email: string;
  language: Locale | null;
  theme: ThemePreference | null;
  alias: string | null;
  photo_base64: string | null;
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
  if (typeof window.matchMedia !== "function") return false;
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
    if (!prefsCacheWritesAllowed) return;
    localStorage.setItem(LANG_CACHE_KEY, locale);
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}

function resolveLocale(raw: string | null | undefined): Locale {
  if (raw === "es" || raw === "en") return raw;
  return browserLocale();
}

function resolveTheme(raw: string | null | undefined): ThemePreference {
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [locale, setLocale] = useState<Locale>(() =>
    typeof window === "undefined" ? "en" : browserLocale(),
  );
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [me, setMe] = useState<MePreferences | null>(null);
  const refreshGen = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++refreshGen.current;
    const epoch = prefsSessionEpoch;
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (gen !== refreshGen.current || epoch !== prefsSessionEpoch) return;
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
        language?: string | null;
        theme?: string | null;
        alias?: string | null;
        photo_base64?: string | null;
      };
      if (gen !== refreshGen.current || epoch !== prefsSessionEpoch) return;
      const nextLocale = resolveLocale(data.language);
      const nextTheme = resolveTheme(data.theme);
      prefsCacheWritesAllowed = true;
      setMe({
        user_id: data.user_id ?? "",
        email: data.email ?? "",
        language:
          data.language === "es" || data.language === "en" ? data.language : null,
        theme:
          data.theme === "light" ||
          data.theme === "dark" ||
          data.theme === "system"
            ? data.theme
            : null,
        alias: typeof data.alias === "string" && data.alias ? data.alias : null,
        photo_base64:
          typeof data.photo_base64 === "string" && data.photo_base64 ? data.photo_base64 : null,
      });
      setLocale(nextLocale);
      setThemeState(nextTheme);
      applyDom(nextLocale, nextTheme);
    } catch {
      if (gen !== refreshGen.current || epoch !== prefsSessionEpoch) return;
      const fallback = browserLocale();
      setLocale(fallback);
      setThemeState("system");
      applyDom(fallback, "system");
    } finally {
      if (gen === refreshGen.current && epoch === prefsSessionEpoch) {
        setReady(true);
      }
    }
  }, []);

  useEffect(() => {
    // Hydrate from account API after mount (SoT is server, not localStorage).
    const handle = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      window.clearTimeout(handle);
      refreshGen.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (theme !== "system") return;
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyDom(locale, "system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, locale]);

  const setLanguage = useCallback(async (language: Locale) => {
    refreshGen.current += 1;
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
      language?: string | null;
      theme?: string | null;
      user_id?: string;
      email?: string;
      alias?: string | null;
      photo_base64?: string | null;
    };
    const nextLocale = resolveLocale(data.language);
    const nextTheme = resolveTheme(data.theme);
    setLocale(nextLocale);
    setThemeState(nextTheme);
    setMe({
      user_id: data.user_id ?? "",
      email: data.email ?? "",
      language:
        data.language === "es" || data.language === "en" ? data.language : null,
      theme:
        data.theme === "light" ||
        data.theme === "dark" ||
        data.theme === "system"
          ? data.theme
          : null,
      alias: typeof data.alias === "string" && data.alias ? data.alias : null,
      photo_base64:
        typeof data.photo_base64 === "string" && data.photo_base64 ? data.photo_base64 : null,
    });
    applyDom(nextLocale, nextTheme);
  }, []);

  const setTheme = useCallback(async (next: ThemePreference) => {
    refreshGen.current += 1;
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
      language?: string | null;
      theme?: string | null;
      user_id?: string;
      email?: string;
      alias?: string | null;
      photo_base64?: string | null;
    };
    const nextLocale = resolveLocale(data.language);
    const nextTheme = resolveTheme(data.theme);
    setLocale(nextLocale);
    setThemeState(nextTheme);
    setMe({
      user_id: data.user_id ?? "",
      email: data.email ?? "",
      language:
        data.language === "es" || data.language === "en" ? data.language : null,
      theme:
        data.theme === "light" ||
        data.theme === "dark" ||
        data.theme === "system"
          ? data.theme
          : null,
      alias: typeof data.alias === "string" && data.alias ? data.alias : null,
      photo_base64:
        typeof data.photo_base64 === "string" && data.photo_base64 ? data.photo_base64 : null,
    });
    applyDom(nextLocale, nextTheme);
  }, []);

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
