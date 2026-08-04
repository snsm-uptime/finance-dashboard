"use client";

import Link from "next/link";
import { useState } from "react";

import { usePreferences } from "@/components/PreferencesProvider";
import { accountCopy } from "@/lib/i18n/account";
import type { Locale, ThemePreference } from "@/lib/i18n/locale";

import styles from "./AccountMenu.module.css";

export function AccountMenu() {
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
      setError("Could not save language. Try again.");
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
      setError("Could not save theme. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      window.location.assign("/sign-in");
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <p className={styles.brand}>{t.brand}</p>
        <Link className={styles.navLink} href="/lists">
          {t.backToLists}
        </Link>
      </div>
      <h1 className={styles.title}>{t.title}</h1>
      <p className={styles.subtitle}>{t.subtitle}</p>

      {!ready ? <p className={styles.hint}>{t.saving}</p> : null}

      <section className={styles.section} aria-labelledby="account-language">
        <h2 id="account-language" className={styles.sectionTitle}>
          {t.language}
        </h2>
        <div className={styles.row} role="group" aria-label={t.language}>
          <button
            type="button"
            className={locale === "en" ? styles.choiceActive : styles.choice}
            disabled={pending}
            onClick={() => void onLanguage("en")}
          >
            {t.en}
          </button>
          <button
            type="button"
            className={locale === "es" ? styles.choiceActive : styles.choice}
            disabled={pending}
            onClick={() => void onLanguage("es")}
          >
            {t.es}
          </button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="account-theme">
        <h2 id="account-theme" className={styles.sectionTitle}>
          {t.theme}
        </h2>
        <div className={styles.row} role="group" aria-label={t.theme}>
          {(
            [
              ["light", t.light],
              ["dark", t.dark],
              ["system", t.system],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={theme === value ? styles.choiceActive : styles.choice}
              disabled={pending}
              onClick={() => void onTheme(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <Link className={styles.resetLink} href="/forgot-password">
          {t.passwordReset}
        </Link>
      </section>

      <section className={styles.section}>
        <button
          type="button"
          className={styles.signOut}
          disabled={signingOut}
          onClick={() => void onSignOut()}
        >
          {signingOut ? t.signingOut : t.signOut}
        </button>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
    </main>
  );
}
