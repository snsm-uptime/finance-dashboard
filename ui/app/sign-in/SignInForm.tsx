"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { EyeIcon } from "@/app/icons";
import { signInMessages, type Locale } from "@/lib/i18n/signin";
import { attemptSignIn } from "./signInClient";
import styles from "../signup/signup.module.scss";

type Props = {
  locale: Locale;
  returnTo?: string;
};

export function SignInForm({ locale, returnTo }: Props) {
  const t = signInMessages[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length > 0 && !pending,
    [email, password, pending],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await attemptSignIn({
        email,
        password,
        returnTo,
        errorGeneric: t.errorGeneric,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.assign(result.returnTo);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.label} htmlFor="email">
        {t.email}
        <input
          id="email"
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className={styles.label} htmlFor="password">
        {t.password}
        <span className={styles.passwordField}>
          <input
            id="password"
            className={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className={styles.eyeButton}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t.hidePassword : t.showPassword}
            aria-pressed={showPassword}
          >
            <EyeIcon open={showPassword} />
          </button>
        </span>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.submit} type="submit" disabled={!canSubmit}>
        {pending ? t.submitting : t.submit}
      </button>
      <p className={styles.hint}>
        <Link href="/forgot-password">{t.forgotPassword}</Link>
      </p>
      <p className={styles.hint}>
        {t.noAccount} <Link href="/signup">{t.signUpLink}</Link>
      </p>
    </form>
  );
}
