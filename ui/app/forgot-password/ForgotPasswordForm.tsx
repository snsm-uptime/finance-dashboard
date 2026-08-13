"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import {
  passwordResetMessages,
  type Locale,
} from "@/lib/i18n/password-reset";
import styles from "../signup/signup.module.scss";

type Props = {
  locale: Locale;
};

export function ForgotPasswordForm({ locale }: Props) {
  const t = passwordResetMessages[locale];
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && !pending,
    [email, pending],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email }),
        credentials: "same-origin",
      });
      if (response.status === 503) {
        setError(t.forgotErrorSmtp);
        return;
      }
      if (response.status === 429) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
          detail?: string;
        } | null;
        if (body?.code === "rate_limited") {
          setError(
            body.detail || "Too many attempts. Please try again later.",
          );
          return;
        }
      }
      if (!response.ok) {
        setError(t.forgotErrorGeneric);
        return;
      }
      setSuccess(t.forgotSuccess);
    } catch {
      setError(t.forgotErrorGeneric);
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
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className={styles.hint} role="status">
          {success}
        </p>
      ) : null}
      <button className={styles.submit} type="submit" disabled={!canSubmit}>
        {pending ? t.forgotSubmitting : t.forgotSubmit}
      </button>
      <p className={styles.hint}>
        <Link href="/sign-in">{t.backToSignIn}</Link>
      </p>
    </form>
  );
}
