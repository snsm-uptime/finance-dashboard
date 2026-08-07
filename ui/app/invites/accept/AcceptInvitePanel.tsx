"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { resolveAuthenticatedLanding } from "@/lib/landing";
import { inviteMessages, type Locale } from "@/lib/i18n/invite";
import { setLastOpenedList } from "@/app/lists/listsClient";
import { acceptInvite } from "../inviteClient";
import styles from "../../signup/signup.module.css";

type Props = {
  locale: Locale;
  token: string;
  authenticated: boolean;
};

export function AcceptInvitePanel({ locale, token, authenticated }: Props) {
  const router = useRouter();
  const t = inviteMessages[locale];
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(() => authenticated && Boolean(token));
  const [needsVerify, setNeedsVerify] = useState(false);

  useEffect(() => {
    if (!authenticated || !token) return;
    let cancelled = false;
    // Accept lifecycle is effect-driven (token + session). Reset UI before the request.
    /* eslint-disable react-hooks/set-state-in-effect -- intentional accept kickoff */
    setPending(true);
    setError(null);
    setNeedsVerify(false);
    /* eslint-enable react-hooks/set-state-in-effect */
    (async () => {
      const result = await acceptInvite(token, {
        errorExpired: t.errorExpired,
        errorMismatch: t.errorMismatch,
        errorNotVerified: t.errorNotVerified,
        errorGeneric: t.errorGeneric,
        errorUnauthorized: t.errorUnauthorized,
      });
      if (cancelled) return;
      if (!result.ok) {
        if (result.code === "email_not_verified") {
          setNeedsVerify(true);
        } else {
          setError(result.error);
        }
        setPending(false);
        return;
      }
      // Last-opened is best-effort; membership already succeeded — always land.
      const remembered = await setLastOpenedList(result.listId, {
        errorGeneric: t.errorGeneric,
        errorInvalidName: t.errorGeneric,
        errorForbidden: t.errorGeneric,
        errorUnauthorized: t.errorUnauthorized,
      });
      if (!remembered.ok) {
        // Intentionally still navigate — remembered list is non-blocking.
      }
      if (cancelled) return;
      const dest = resolveAuthenticatedLanding({ inviteListId: result.listId });
      router.replace(dest);
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per token when signed in
  }, [authenticated, token]);

  if (!token) {
    return (
      <p className={styles.error} role="alert">
        {t.errorExpired}
      </p>
    );
  }

  if (!authenticated) {
    const returnTo = `/invites/accept?token=${encodeURIComponent(token)}`;
    return (
      <div className={styles.form}>
        <p className={styles.hint}>{t.signInPrompt}</p>
        <Link className={styles.submit} href={`/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>
          {t.signInCta}
        </Link>
      </div>
    );
  }

  if (needsVerify) {
    const verifyHref = `/verify?returnTo=${encodeURIComponent(`/invites/accept?token=${token}`)}`;
    return (
      <div className={styles.form}>
        <p className={styles.error} role="alert">
          {t.errorNotVerified}
        </p>
        <Link className={styles.submit} href={verifyHref}>
          {t.verifyCta}
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  }

  return (
    <p className={styles.hint} role="status">
      {pending ? t.accepting : t.acceptSuccess}
    </p>
  );
}
