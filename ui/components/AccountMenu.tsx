"use client";

import { useEffect, useState } from "react";

import { CardsPanel } from "@/app/cards/CardsPanel";
import { DefaultImportListControl } from "@/app/cards/DefaultImportListControl";
import { MoonIcon, SunIcon, SystemIcon } from "@/app/icons";
import { fetchLists, type ListItem } from "@/app/lists/listsClient";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";
import {
  clearPrefsCache,
  usePreferences,
} from "@/components/PreferencesProvider";
import { TriSwitch } from "@/components/TriSwitch";
import { accountCopy } from "@/lib/i18n/account";
import type { Locale, ThemePreference } from "@/lib/i18n/locale";

import styles from "./AccountMenu.module.scss";

export function AccountMenu() {
  // NOTE: SSR hydration mismatch — server renders with default theme; client may hydrate with different theme.
  // This can cause brief light→dark flicker on page load. Mitigation: ensure initial HTML theme matches system preference.
  const { locale, theme, setLanguage, setTheme, ready } = usePreferences();
  const t = accountCopy(locale);
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<ListItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchLists({
      errorGeneric: t.errorGeneric,
      errorInvalidName: t.errorGeneric,
      errorForbidden: t.errorForbidden,
      errorUnauthorized: t.errorUnauthorized,
    }).then((result) => {
      if (!cancelled && result.ok) setLists(result.lists);
    });
    return () => {
      cancelled = true;
    };
    // List membership is independent of locale; fetch once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onLanguage(next: Locale) {
    setPending(true);
    setError(null);
    try {
      await setLanguage(next);
    } catch {
      setError(t.saveLanguageFailed);
    } finally {
      setPending(false);
    }
  }

  async function onTheme(next: ThemePreference) {
    setPending(true);
    setError(null);
    try {
      await setTheme(next);
    } catch {
      setError(t.saveThemeFailed);
    } finally {
      setPending(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    clearPrefsCache();
    resetMembershipListsStore();
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      clearPrefsCache();
      resetMembershipListsStore();
      window.location.assign("/sign-in");
    }
  }

  async function onPasswordReset() {
    setSigningOut(true);
    clearPrefsCache();
    resetMembershipListsStore();
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      clearPrefsCache();
      resetMembershipListsStore();
      window.location.assign("/forgot-password");
    }
  }

  const controlsDisabled = pending || !ready || signingOut;

  const choiceButtonClass = `font-inherit text-[0.85rem] font-semibold py-[0.5rem] px-[0.85rem] rounded-[8px] border border-border bg-surface text-foreground cursor-pointer ${styles.choice}`;
  const choiceButtonActiveClass = `font-inherit text-[0.85rem] font-semibold py-[0.5rem] px-[0.85rem] rounded-[8px] border border-accent bg-accent text-on-accent cursor-pointer ${styles.choiceActive}`;
  const ghostClass = `font-inherit text-[0.9rem] font-semibold py-[0.55rem] px-[1rem] rounded-[8px] border-0 bg-transparent text-muted cursor-pointer ${styles.ghost}`;
  const signOutClass = `font-inherit text-[0.9rem] font-semibold py-[0.55rem] px-[1rem] rounded-[8px] border border-border bg-surface text-foreground cursor-pointer ${styles.signOut}`;

  return (
    <main className="py-[2.5rem] px-[1.5rem]" style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}>
      <h1 className="m-0 mb-[0.35rem] text-[1.75rem] font-[550] text-foreground">
        {t.title}
      </h1>
      <p className="m-0 mb-[1.75rem] max-w-[28rem] text-muted leading-[1.45] text-[0.95rem]">
        {t.subtitle}
      </p>

      {!ready ? (
        <p className="text-muted text-[0.85rem]">{t.loading}</p>
      ) : null}

      <div className="mb-6 flex flex-row flex-wrap items-start gap-x-8 gap-y-6">
        <section aria-labelledby="account-language">
          <h2 id="account-language" className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]">
            {t.language}
          </h2>
          {/* TODO: Add RTL-aware layout (dir attribute on parent or logical CSS properties) */}
          <div className="flex flex-wrap gap-2" role="group" aria-label={t.language}>
            <button
              type="button"
              className={locale === "en" ? choiceButtonActiveClass : choiceButtonClass}
              aria-pressed={locale === "en"}
              disabled={controlsDisabled}
              onClick={() => void onLanguage("en")}
            >
              {t.en}
            </button>
            <button
              type="button"
              className={locale === "es" ? choiceButtonActiveClass : choiceButtonClass}
              aria-pressed={locale === "es"}
              disabled={controlsDisabled}
              onClick={() => void onLanguage("es")}
            >
              {t.es}
            </button>
          </div>
        </section>

        <section aria-labelledby="account-theme">
          <h2 id="account-theme" className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]">
            {t.theme}
          </h2>
          <TriSwitch
            aria-label={t.theme}
            value={theme}
            disabled={controlsDisabled}
            onChange={(next) => void onTheme(next)}
            options={[
              { value: "light", label: t.light, icon: <SunIcon /> },
              { value: "system", label: t.system, icon: <SystemIcon /> },
              { value: "dark", label: t.dark, icon: <MoonIcon /> },
            ]}
          />
        </section>
      </div>

      {lists.length > 0 ? (
        <div className="mb-6">
          <DefaultImportListControl
            lists={lists}
            messages={{
              defaultListTitle: t.defaultListTitle,
              defaultListHint: t.defaultListHint,
              errorGeneric: t.errorGeneric,
              errorUnauthorized: t.errorUnauthorized,
              errorForbidden: t.errorForbidden,
            }}
          />
        </div>
      ) : null}

      <section className="mb-6" aria-labelledby="account-cards">
        <h2 id="account-cards" className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]">
          {t.manageCards}
        </h2>
        <CardsPanel />
      </section>

      <section className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ghostClass}
            disabled={signingOut}
            onClick={() => void onPasswordReset()}
          >
            {t.passwordReset}
          </button>
          <button
            type="button"
            className={signOutClass}
            disabled={signingOut}
            onClick={() => void onSignOut()}
          >
            {signingOut ? t.signingOut : t.signOut}
          </button>
        </div>
      </section>

      {error ? (
        <p className="text-owe text-[0.9rem]">{error}</p>
      ) : null}
    </main>
  );
}
