"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";

import { type Locale, verifyMessages } from "@/lib/i18n/verify";
import { safeReturnTo } from "../sign-in/signInClient";
import styles from "../signup/signup.module.scss";

type Props = {
  locale: Locale;
  token: string;
  returnTo?: string;
};

export function VerifyForm({ locale, token, returnTo }: Props) {
  const t = verifyMessages[locale];
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [pendingResend, setPendingResend] = useState(false);

  // Reuse sign-in sanitizer; unsafe values become "/" — fall back to lists for verify.
  // Success routes through /alias so a verified account picks a display alias
  // before any list chrome; /alias passes straight through once one is set.
  const continueHref = (() => {
    const destination = (() => {
      if (!returnTo) return "/lists";
      const safe = safeReturnTo(returnTo);
      return safe === "/" ? "/lists" : safe;
    })();
    return `/alias?returnTo=${encodeURIComponent(destination)}`;
  })();

  const canConfirm = useMemo(
    () => token.length > 0 && !pendingConfirm,
    [token, pendingConfirm],
  );

  async function onConfirm(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setResendMessage(null);
    setPendingConfirm(true);
    try {
      const response = await fetch("/api/auth/verify/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
        } | null;
        if (body?.code === "invalid_verification_token") {
          setError(t.confirmErrorToken);
        } else if (body?.code === "verification_not_required") {
          setError(t.resendNotRequired);
        } else {
          setError(t.confirmErrorGeneric);
        }
        return;
      }
      setSuccess(true);
    } catch {
      setError(t.confirmErrorGeneric);
    } finally {
      setPendingConfirm(false);
    }
  }

  async function onResend(event: FormEvent) {
    event.preventDefault();
    setResendMessage(null);
    setError(null);
    setPendingResend(true);
    try {
      const response = await fetch("/api/auth/verify/request", {
        method: "POST",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        already_verified?: boolean;
        detail?: string;
      } | null;
      if (response.status === 401) {
        setError(t.resendUnauthorized);
        return;
      }
      if (response.status === 404 || body?.code === "verification_not_required") {
        setError(t.resendNotRequired);
        return;
      }
      if (
        response.status === 503 ||
        body?.code === "smtp_config_error" ||
        body?.code === "smtp_send_error"
      ) {
        setError(t.resendSmtp);
        return;
      }
      if (response.status === 429 || body?.code === "rate_limited") {
        setError(
          body?.detail || "Too many attempts. Please try again later.",
        );
        return;
      }
      if (!response.ok) {
        setError(t.resendGeneric);
        return;
      }
      setResendMessage(body?.already_verified ? t.resendAlready : t.resendSuccess);
    } catch {
      setError(t.resendGeneric);
    } finally {
      setPendingResend(false);
    }
  }

  if (success) {
    return (
      <div className={styles.form}>
        <p className={styles.hint} role="status">
          {t.confirmSuccess}
        </p>
        <p className={styles.hint}>
          <Link href={continueHref}>{t.listsLink}</Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      {token ? (
        <form onSubmit={onConfirm}>
          <button className={styles.submit} type="submit" disabled={!canConfirm}>
            {pendingConfirm ? t.confirmSubmitting : t.confirmSubmit}
          </button>
        </form>
      ) : (
        <p className={styles.hint} role="status">
          {t.confirmMissingToken}
        </p>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {resendMessage ? (
        <p className={styles.hint} role="status">
          {resendMessage}
        </p>
      ) : null}
      <form onSubmit={onResend}>
        <button className={styles.submit} type="submit" disabled={pendingResend}>
          {pendingResend ? t.resending : t.resend}
        </button>
      </form>
      <p className={styles.hint}>
        <Link href="/sign-in">{t.signInLink}</Link>
      </p>
    </div>
  );
}
