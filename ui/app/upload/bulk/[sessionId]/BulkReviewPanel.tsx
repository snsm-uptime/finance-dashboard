"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { IconButton } from "@/components/IconButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { fetchLists } from "@/app/lists/listsClient";
import { replaceMembershipLists, useMembershipLists } from "@/app/lists/membershipListsStore";
import { SpinnerIcon, TrashIcon } from "@/app/icons";
import { uploadCopy } from "@/lib/i18n/upload";
import {
  assignRow,
  bulkCommitSession,
  deleteRow,
  fetchImportSession,
  finalizeSession,
  type BulkCommitMessages,
  type CandidateRow,
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
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [acknowledgedFailedIds, setAcknowledgedFailedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [actingRowId, setActingRowId] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);

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
      if (result.ok) {
        setSession(result.session);
        setSessionError(null);
      } else {
        setSession(null);
        setSessionError(result.error);
      }
      setSessionReady(true);
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

  // Rows still pending across every staged statement (Story 4.19) — the
  // fixed-list commit's default set, minus whatever the exception controls
  // below already moved or deleted. GET already returns pending-only rows
  // (see reviewSequence.ts), so this needs no status filter of its own.
  const pendingRows = useMemo(
    () => (session?.statements ?? []).flatMap((statement) => statement.rows),
    [session],
  );

  const commit = useFormSubmission(async () => {
    if (pendingRows.length === 0) {
      // Every row was resolved individually via the exception controls
      // below — nothing left for bulk-commit to do, but the session still
      // needs its end-of-review finalize + PDF release (mirrors
      // ImportReviewSheet's Done action for the row-by-row flow).
      const result = await finalizeSession(sessionId, reviewMessages);
      if (result.ok) {
        router.push(`/lists/${encodeURIComponent(listId)}`);
        return { ok: true };
      }
      return result;
    }
    const result = await bulkCommitSession(sessionId, listId, bulkCommitMessages);
    if (result.ok) {
      router.push(`/lists/${encodeURIComponent(result.result.list_id)}`);
    }
    return result;
  });

  async function handleDeleteRow(rowId: string) {
    setActingRowId(rowId);
    setRowActionError(null);
    const result = await deleteRow(sessionId, rowId, reviewMessages);
    setActingRowId(null);
    if (result.ok) {
      setSession(result.session);
    } else {
      setRowActionError(result.error);
    }
  }

  async function handleMoveRow(rowId: string, targetListId: string) {
    if (!targetListId) return;
    setActingRowId(rowId);
    setRowActionError(null);
    const result = await assignRow(sessionId, rowId, targetListId, reviewMessages);
    setActingRowId(null);
    if (result.ok) {
      setSession(result.session);
    } else {
      setRowActionError(result.error);
    }
  }

  const listOptions = (lists ?? []).map((l) => ({ value: l.id, label: l.name }));
  const failedStatement = nextUnacknowledgedFailedStatement(session, acknowledgedFailedIds);

  if (!sessionReady) {
    return (
      <main
        className="min-h-full py-[2.5rem] px-[1.5rem]"
        style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
      >
        <span
          className="grid size-5 place-items-center text-muted"
          aria-label={t.bulkReviewLoadingSession}
          aria-busy="true"
        >
          <SpinnerIcon className="size-5 animate-spin motion-reduce:animate-none" />
        </span>
      </main>
    );
  }

  if (sessionError) {
    return (
      <main
        className="min-h-full py-[2.5rem] px-[1.5rem]"
        style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
      >
        <p className="text-owe text-[0.9rem] m-0" role="alert">
          {sessionError}
        </p>
      </main>
    );
  }

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
        onDismissStatement={(nextSession) => setSession(nextSession)}
        onDismissFile={() => router.push("/upload")}
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

        {listId && pendingRows.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-[0.8rem] text-muted">{t.bulkReviewRowsHeading}</p>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {pendingRows.map((row) => (
                <PendingRowItem
                  key={row.id}
                  row={row}
                  locale={locale}
                  moveOptions={listOptions.filter((option) => option.value !== listId)}
                  movePlaceholder={t.bulkReviewMoveRowPlaceholder}
                  deleteLabel={t.bulkReviewDeleteRow}
                  disabled={actingRowId !== null}
                  onDelete={() => handleDeleteRow(row.id)}
                  onMove={(targetListId) => handleMoveRow(row.id, targetListId)}
                />
              ))}
            </ul>
          </div>
        ) : null}

        <div aria-live="polite">
          {rowActionError ? (
            <p className="text-owe text-[0.9rem] m-0" role="alert">
              {rowActionError}
            </p>
          ) : null}
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

// Simple (amount, currency) display — mirrors IndividualReviewPanel's
// formatRowAmount but kept local per this codebase's co-located-pure-function
// convention (see SessionReviewPanel.tsx's statementPeriodBounds comment).
function formatPendingRowAmount(amount: string, currency: string, locale: string): string {
  const parsed = Number(amount);
  const display = Number.isFinite(parsed)
    ? parsed.toLocaleString(locale === "es" ? "es-CR" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : amount;
  return `${currency} ${display}`;
}

function PendingRowItem({
  row,
  locale,
  moveOptions,
  movePlaceholder,
  deleteLabel,
  disabled,
  onDelete,
  onMove,
}: {
  row: CandidateRow;
  locale: string;
  moveOptions: { value: string; label: string }[];
  movePlaceholder: string;
  deleteLabel: string;
  disabled: boolean;
  onDelete: () => void;
  onMove: (targetListId: string) => void;
}) {
  const moveSelectId = useId();
  return (
    <li className="flex items-center gap-2 rounded-[8px] border border-border bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[0.85rem] font-[550] text-foreground">
          {row.description}
        </p>
        <p className="m-0 text-[0.75rem] text-muted">
          {formatPendingRowAmount(row.amount, row.currency, locale)} · {row.posted_date.slice(0, 10)}
        </p>
      </div>
      {moveOptions.length > 0 ? (
        <div className="w-[9rem] shrink-0">
          <SoftLedgerSelect
            id={moveSelectId}
            value=""
            options={[{ value: "", label: movePlaceholder }, ...moveOptions]}
            onChange={onMove}
            disabled={disabled}
          />
        </div>
      ) : null}
      <IconButton
        icon={<TrashIcon className="w-4 h-4" />}
        label={deleteLabel}
        disabled={disabled}
        onClick={onDelete}
      />
    </li>
  );
}
