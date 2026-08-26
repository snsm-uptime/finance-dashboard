"use client";

import { useEffect, useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { fetchLists } from "@/app/lists/listsClient";
import { replaceMembershipLists, useMembershipLists } from "@/app/lists/membershipListsStore";
import { SpinnerIcon } from "@/app/icons";
import { uploadCopy } from "@/lib/i18n/upload";
import {
  bulkCommitSession,
  fetchImportSession,
  type BulkCommitMessages,
  type ImportSession,
  type IndividualReviewMessages,
} from "../../uploadClient";
import { nextUnacknowledgedFailedStatement } from "../../reviewSequence";

const ParseComparisonPanel = dynamic(
  () => import("../../ParseComparisonPanel").then((mod) => mod.ParseComparisonPanel),
  { ssr: false },
);

type BulkReviewPanelProps = {
  sessionId: string;
};

/**
 * Bulk review assign & commit screen (Story 4.7, AC #1/#2/#3). Picks one
 * list for the whole upload, confirms, and lands on that list's
 * shared-expenses view — the dedup-count summary itself is Story 4.9's.
 */
export function BulkReviewPanel({ sessionId }: BulkReviewPanelProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectId = useId();

  const [listsError, setListsError] = useState<string | null>(null);
  const lists = useMembershipLists();
  const [listId, setListId] = useState<string>("");
  const [session, setSession] = useState<ImportSession | null>(null);
  const [acknowledgedFailedIds, setAcknowledgedFailedIds] = useState<Set<string>>(
    () => new Set(),
  );

  const reviewMessages: IndividualReviewMessages = {
    errorForbidden: t.bulkReviewErrorForbidden,
    errorSessionNotFound: t.bulkReviewErrorSessionNotFound,
    errorStatementNotFound: t.bulkReviewErrorSessionNotFound,
    errorSessionDiscarded: t.bulkReviewErrorSessionDiscarded,
    errorStatementNotAvailable: t.bulkReviewErrorAlreadyCommitted,
    errorRowNotFound: t.bulkReviewErrorRowNotAvailable,
    errorRowNotAvailable: t.bulkReviewErrorRowNotAvailable,
    errorNothingToUndo: t.errorGeneric,
    errorFxUnavailable: t.bulkReviewErrorFxUnavailable,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  useEffect(() => {
    let cancelled = false;
    fetchImportSession(sessionId, reviewMessages).then((result) => {
      if (cancelled) return;
      if (result.ok) setSession(result.session);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchLists({
        errorGeneric: t.errorGeneric,
        errorInvalidName: t.errorGeneric,
        errorForbidden: t.bulkReviewErrorForbidden,
        errorUnauthorized: t.errorUnauthorized,
      });
      if (cancelled) return;
      if (!result.ok) {
        setListsError(result.error);
        return;
      }
      replaceMembershipLists(result.lists);
      // AC #2 / UX-DR23: pre-select the originating list when the upload was
      // launched from inside one — only if it's actually one the actor belongs to.
      const preselect = searchParams.get("listId");
      if (preselect && result.lists.some((l) => l.id === preselect)) {
        setListId(preselect);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const bulkCommitMessages: BulkCommitMessages = {
    errorForbidden: t.bulkReviewErrorForbidden,
    errorSessionNotFound: t.bulkReviewErrorSessionNotFound,
    errorSessionDiscarded: t.bulkReviewErrorSessionDiscarded,
    errorAlreadyCommitted: t.bulkReviewErrorAlreadyCommitted,
    errorRowNotAvailable: t.bulkReviewErrorRowNotAvailable,
    errorNoCleanStatements: t.bulkReviewErrorNoCleanStatements,
    errorFxUnavailable: t.bulkReviewErrorFxUnavailable,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  const commit = useFormSubmission(async () => {
    const result = await bulkCommitSession(sessionId, listId, bulkCommitMessages);
    if (result.ok) {
      router.push(`/lists/${encodeURIComponent(result.result.list_id)}`);
    }
    return result;
  });

  const listOptions = (lists ?? []).map((l) => ({ value: l.id, label: l.name }));
  const failedStatement = nextUnacknowledgedFailedStatement(session, acknowledgedFailedIds);

  if (failedStatement) {
    return (
      <ParseComparisonPanel
        key={failedStatement.id}
        sessionId={sessionId}
        statement={failedStatement}
        locale={locale}
        onContinue={() =>
          setAcknowledgedFailedIds((prev) => {
            const next = new Set(prev);
            next.add(failedStatement.id);
            return next;
          })
        }
      />
    );
  }

  return (
    <main
      className="min-h-full py-[2.5rem] px-[1.5rem]"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      <h1 className="m-0 mb-[1.75rem] text-[1.75rem] font-[550] text-foreground">
        {t.bulkReviewTitle}
      </h1>

      <div className="flex flex-col gap-4 max-w-[28rem]">
        {listsError ? (
          <p className="text-owe text-[0.9rem] m-0" role="alert">
            {listsError}
          </p>
        ) : null}

        {lists === null && !listsError ? (
          <span
            className="grid size-5 place-items-center text-muted"
            aria-label={t.bulkReviewLoadingLists}
            aria-busy="true"
          >
            <SpinnerIcon className="size-5 animate-spin motion-reduce:animate-none" />
          </span>
        ) : null}

        {lists !== null && lists.length === 0 ? (
          <p className="text-muted text-[0.85rem] m-0">{t.bulkReviewNoLists}</p>
        ) : null}

        {lists !== null && lists.length > 0 ? (
          <div className="flex flex-col gap-2">
            <label htmlFor={selectId} className="text-[0.9rem] font-[550] text-foreground">
              {t.bulkReviewChooseList}
            </label>
            <SoftLedgerSelect
              id={selectId}
              value={listId}
              options={[{ value: "", label: t.bulkReviewChooseList }, ...listOptions]}
              onChange={setListId}
            />
          </div>
        ) : null}

        <div aria-live="polite">
          {commit.error ? (
            <p className="text-owe text-[0.9rem] m-0" role="alert">
              {commit.error}
            </p>
          ) : null}
        </div>

        <PrimaryButton
          disabled={!listId || commit.pending}
          onClick={() => commit.submit(undefined)}
        >
          {commit.pending ? t.bulkReviewCommitting : t.bulkReviewConfirm}
        </PrimaryButton>
      </div>
    </main>
  );
}
