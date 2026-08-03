"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { signupMessages, type Locale } from "@/lib/i18n/signup";
import styles from "./signup.module.css";

type Props = {
  locale: Locale;
};

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </svg>
  );
}

export function SignupForm({ locale }: Props) {
  const router = useRouter();
  const t = signupMessages[locale];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.length >= 8 && !pending,
    [email, password, pending],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      const data = (await response.json().catch(() => ({}))) as {
        detail?: string;
        code?: string;
      };
      if (!response.ok) {
        if (data.code === "duplicate_email") {
          setError(t.errorDuplicate);
        } else if (data.code === "invalid_signup" || response.status === 400) {
          setError(data.detail || t.errorInvalid);
        } else {
          setError(t.errorGeneric);
        }
        return;
      }
      router.replace("/lists");
      router.refresh();
    } catch {
      setError(t.errorGeneric);
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
        <span className={styles.hint}>{t.passwordHint}</span>
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.submit} type="submit" disabled={!canSubmit}>
        {pending ? t.submitting : t.submit}
      </button>
    </form>
  );
}
