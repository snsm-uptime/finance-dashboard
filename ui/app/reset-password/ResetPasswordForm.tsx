"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { EyeIcon } from "@/app/icons";
import {
  passwordResetMessages,
  type Locale,
} from "@/lib/i18n/password-reset";
import styles from "../signup/signup.module.scss";

type Props = {
  locale: Locale;
  token: string;
};

export function ResetPasswordForm({ locale, token }: Props) {
  const t = passwordResetMessages[locale];
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const canSubmit = useMemo(
    () => token.length > 0 && password.length >= 8 && !pending,
    [token, password, pending],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, new_password: password }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        if (body?.code === "invalid_reset_token") {
          setError(t.resetErrorToken);
        } else if (body?.code === "invalid_reset_password") {
          setError(t.resetErrorPassword);
        } else {
          setError(t.resetErrorGeneric);
        }
        return;
      }
      setSuccess(true);
    } catch {
      setError(t.resetErrorGeneric);
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className={styles.form}>
        <p className={styles.error} role="alert">
          {t.resetMissingToken}
        </p>
        <p className={styles.hint}>
          <Link href="/forgot-password">{t.forgotTitle}</Link>
        </p>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.form}>
        <p className={styles.hint} role="status">
          {t.resetSuccess}
        </p>
        <p className={styles.hint}>
          <Link href="/sign-in">{t.signInLink}</Link>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <label className={styles.label} htmlFor="new_password">
        {t.newPassword}
        <span className={styles.passwordField}>
          <input
            id="new_password"
            className={styles.passwordInput}
            type={showPassword ? "text" : "password"}
            name="new_password"
            autoComplete="new-password"
            required
            minLength={8}
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
        {pending ? t.resetSubmitting : t.resetSubmit}
      </button>
      <p className={styles.hint}>
        <Link href="/sign-in">{t.backToSignIn}</Link>
      </p>
    </form>
  );
}
