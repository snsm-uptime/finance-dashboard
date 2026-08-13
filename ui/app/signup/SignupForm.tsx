"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { EyeIcon } from "@/app/icons";
import { resolveAuthenticatedLanding } from "@/lib/landing";
import { inviteMessages } from "@/lib/i18n/invite";
import { signupMessages, type Locale } from "@/lib/i18n/signup";
import { setLastOpenedList } from "@/app/lists/listsClient";
import { fetchInvitePreview } from "@/app/invites/inviteClient";
import { attemptSignup } from "./signupClient";
import styles from "./signup.module.scss";

type Props = {
  locale: Locale;
  inviteToken?: string;
};

export function SignupForm({ locale, inviteToken }: Props) {
  const router = useRouter();
  const t = signupMessages[locale];
  const ti = inviteMessages[locale];
  const [email, setEmail] = useState("");
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [listName, setListName] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(Boolean(inviteToken));
  const [inviteFatal, setInviteFatal] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      setInviteLoading(true);
      const preview = await fetchInvitePreview(inviteToken, {
        errorExpired: t.errorExpiredInvite,
        errorGeneric: t.errorGeneric,
      });
      if (cancelled) return;
      if (!preview.ok) {
        setInviteFatal(preview.error);
        setInviteLoading(false);
        return;
      }
      if (preview.preview.path === "join") {
        router.replace(
          `/invites/accept?token=${encodeURIComponent(inviteToken)}`,
        );
        return;
      }
      setListName(preview.preview.list_name);
      setEmailHint(preview.preview.email_hint);
      setInviteLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, t.errorExpiredInvite, t.errorGeneric, router]);

  const canSubmit = useMemo(
    () =>
      email.trim().length > 0 &&
      password.length >= 8 &&
      !pending &&
      !inviteLoading &&
      !inviteFatal,
    [email, password, pending, inviteLoading, inviteFatal],
  );

  const subtitle = listName
    ? ti.inviteSignupSubtitle.replace("{listName}", listName)
    : t.subtitle;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await attemptSignup({
        email,
        password,
        inviteToken: inviteToken || null,
        errorDuplicate: t.errorDuplicate,
        errorInvalid: t.errorInvalid,
        errorGeneric: t.errorGeneric,
        errorExpiredInvite: t.errorExpiredInvite,
        errorInviteMismatch: t.errorInviteMismatch,
        errorNotVerified: t.errorNotVerified,
      });
      if (!result.ok) {
        if (result.needsVerify && inviteToken) {
          const returnTo = `/invites/accept?token=${encodeURIComponent(inviteToken)}`;
          router.replace(`/verify?returnTo=${encodeURIComponent(returnTo)}`);
          router.refresh();
          return;
        }
        setError(result.error);
        return;
      }
      const inviteListId = result.invitingListId;
      if (inviteListId) {
        // Last-opened is best-effort; membership already succeeded — always land.
        const remembered = await setLastOpenedList(inviteListId, {
          errorGeneric: t.errorGeneric,
          errorInvalidName: t.errorGeneric,
          errorForbidden: t.errorGeneric,
          errorUnauthorized: t.errorGeneric,
        });
        if (!remembered.ok) {
          // Intentionally still navigate — remembered list is non-blocking.
        }
      }
      const dest = resolveAuthenticatedLanding({ inviteListId });
      router.replace(dest);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (inviteFatal) {
    return (
      <p className={styles.error} role="alert">
        {inviteFatal}
      </p>
    );
  }

  if (inviteLoading) {
    return (
      <p className={styles.hint} role="status">
        {t.loadingInvite}
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <p className={styles.hint}>{subtitle}</p>
      {emailHint ? (
        <p className={styles.hint}>
          {ti.emailMatchHint.replace("{emailHint}", emailHint)}
        </p>
      ) : null}
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
