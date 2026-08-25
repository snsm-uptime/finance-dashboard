"use client";

import Link from "next/link";
import { useState } from "react";

import { MoonIcon, SunIcon, SystemIcon } from "@/app/icons";
import {
  clearPrefsCache,
  usePreferences,
} from "@/components/PreferencesProvider";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";
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
  const resetLinkClass = `inline-block font-inherit text-[0.95rem] font-semibold p-0 border-0 bg-transparent text-accent no-underline cursor-pointer ${styles.resetLink}`;
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

      <section className="mb-6" aria-labelledby="account-language">
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

      <section className="mb-6" aria-labelledby="account-theme">
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

      <section className="mb-6">
        <Link className={resetLinkClass} href="/cards">
          {t.manageCards}
        </Link>
      </section>

      <section className="mb-6">
        <button
          type="button"
          className={resetLinkClass}
          disabled={signingOut}
          onClick={() => void onPasswordReset()}
        >
          {t.passwordReset}
        </button>
      </section>

      <section className="mb-6">
        <button
          type="button"
          className={signOutClass}
          disabled={signingOut}
          onClick={() => void onSignOut()}
        >
          {signingOut ? t.signingOut : t.signOut}
        </button>
      </section>

      {error ? (
        <p className="text-owe text-[0.9rem]">{error}</p>
      ) : null}
    </main>
  );
}
