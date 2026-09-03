"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useChromeHeader } from "@/components/ChromeBack";
import { usePreferences } from "@/components/PreferencesProvider";
import { SpinnerIcon } from "@/app/icons";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
import { uploadCopy } from "@/lib/i18n/upload";
import { fetchImportSession, type ImportSession } from "../../uploadClient";
import { SessionReviewPanel } from "../../SessionReviewPanel";

type SessionReviewRouteProps = {
  sessionId: string;
};

/**
 * Thin client wrapper that fetches an existing session by id (mirrors
 * BulkReviewPanel's fetch-by-id pattern) and hands it to SessionReviewPanel,
 * so clicking a queued upload gets the same fixed-list auto-routing
 * (Story 4.19) as a fresh upload instead of jumping straight to individual
 * review.
 */
export function SessionReviewRoute({ sessionId }: SessionReviewRouteProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const router = useRouter();
  const [session, setSession] = useState<ImportSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useChromeHeader({
    trailing: (
      <DocsHelpButton pageName="Upload" docsAnchor="/docs#cards-imports" />
    ),
  });

  useEffect(() => {
    let cancelled = false;
    fetchImportSession(sessionId, {
      errorForbidden: t.errorGeneric,
      errorSessionNotFound: t.errorGeneric,
      errorStatementNotFound: t.errorGeneric,
      errorSessionDiscarded: t.errorGeneric,
      errorStatementNotAvailable: t.errorGeneric,
      errorRowNotFound: t.errorGeneric,
      errorRowNotAvailable: t.errorGeneric,
      errorNothingToUndo: t.errorGeneric,
      errorFxUnavailable: t.errorGeneric,
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
    }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSession(result.session);
        setError(null);
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (error) {
    return (
      <section
        aria-label={t.cardIdentificationTitle}
        className="flex min-h-full w-full flex-1 flex-col items-center justify-center"
      >
        <p className="text-owe text-[0.9rem] m-0" role="alert">
          {error}
        </p>
      </section>
    );
  }

  if (!session) {
    return (
      <section
        aria-label={t.cardIdentificationTitle}
        className="flex min-h-full w-full flex-1 flex-col items-center justify-center"
      >
        <span
          className="grid size-8 place-items-center text-muted"
          aria-label={t.cardIdentificationTitle}
          aria-busy="true"
        >
          <SpinnerIcon className="size-8 animate-spin motion-reduce:animate-none" />
        </span>
      </section>
    );
  }

  return (
    <SessionReviewPanel
      session={session}
      onSessionChanged={setSession}
      onDiscarded={() => router.push("/upload")}
    />
  );
}
