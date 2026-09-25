"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

import { Sheet } from "@/app/lists/Sheet";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerRadio } from "@/components/soft-ledger/Radio";
import { IconButton } from "@/components/IconButton";
import { SingleChipPicker, type ChipOption } from "@/components/ChipPicker";
import { useChromeHeader } from "@/components/ChromeBack";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { fetchLists } from "@/app/lists/listsClient";
import { replaceMembershipLists, useMembershipLists } from "@/app/lists/membershipListsStore";
import { SpinnerIcon, TrashIcon } from "@/app/icons";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";
import { uploadCopy } from "@/lib/i18n/upload";
import type { Locale } from "@/lib/i18n/locale";
import {
  bulkCommitSession,
  deleteRow,
  fetchImportSession,
  finalizeSession,
  type BulkCommitMessages,
  type CandidateRow,
  type ImportSession,
  type IndividualReviewMessages,
} from "../../uploadClient";
import {
  clearStagedImportDiscards,
  restoreStagedDiscard,
  stageSheetDiscards,
  useStagedImportDiscards,
} from "../../stagedImportDiscards";
import { removeUploadQueueSession } from "../../uploadQueueStore";
import { nextUnacknowledgedFailedStatement } from "../../reviewSequence";
import { routeAfterImportLanding } from "../../conflictsClient";
import { groupRowsByDay } from "../../review/[sessionId]/ImportReviewSheet";
import { formatRowAmount, formatRowDate } from "../../review/[sessionId]/IndividualReviewPanel";

const ParseComparisonPanel = dynamic(
  () => import("../../ParseComparisonPanel").then((mod) => mod.ParseComparisonPanel),
  { ssr: false },
);

type BulkAssignSheetProps = {
  sessionId: string;
};

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sessionHasRow(session: ImportSession, rowId: string): boolean {
  for (const statement of session.statements) {
    if (statement.rows.some((row) => row.id === rowId)) return true;
    if (statement.assigned_rows.some((row) => row.id === rowId)) return true;
  }
  return false;
}

function dayHeading(dateKey: string, locale: Locale, unknownDateLabel: string): string {
  return dateKey ? formatRowDate(dateKey, locale) : unknownDateLabel;
}

const STICKY_BUTTON_CLASS =
  "m-0 flex-1 cursor-pointer rounded-sm border bg-surface px-3 py-[9px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 enabled:hover:brightness-105";
const STICKY_BUTTON_STYLE = {
  fontFamily: "var(--type-button-face)",
  fontSize: "var(--type-button-size)",
  fontWeight: "var(--type-button-weight)",
  lineHeight: "1.2",
} as const;

/**
 * Bulk assign-to-list, reusing `ImportReviewSheet`'s review UX (Story 4.7
 * behavior, restyled as a sibling sheet rather than a mode on
 * `ImportReviewSheet` itself — see spec-bulk-assign-sheet-reuse.md). All
 * pending rows are treated as bulk-assigned to whichever list the chip
 * picker below the title currently holds; staged/undoable discard
 * (spec-9-24's multiselect, upgraded to staged discard) remains as an escape
 * hatch — moving a row to a different list is Individual Review's job. Save
 * deletes staged discards,
 * then bulk-commits remaining pending rows to the chosen list (or finalizes
 * directly when every row was individually moved elsewhere).
 */
export function BulkAssignSheet({ sessionId }: BulkAssignSheetProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const router = useRouter();
  const searchParams = useSearchParams();
  useChromeHeader({
    trailing: <DocsHelpButton pageName="Upload" docsAnchor="/docs#cards-imports" />,
  });

  const [listsError, setListsError] = useState<string | null>(null);
  const lists = useMembershipLists();
  const [listId, setListId] = useState<string>("");
  const [session, setSession] = useState<ImportSession | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [acknowledgedFailedIds, setAcknowledgedFailedIds] = useState<Set<string>>(() => new Set());
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const { staged } = useStagedImportDiscards(sessionId);
  // Save keeps awaiting network calls after Close/Esc/backdrop unmounts the
  // sheet; skip the success side-effects so a late success does not write
  // into an unmounted tree (mirrors ImportReviewSheet's mountedRef).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  // Rows still pending across every staged statement — the fixed-list
  // commit's default set, minus whatever the exception controls below
  // already moved, and minus rows staged for discard (still counted as
  // "pending" server-side until Save's delete loop runs).
  const pendingRows = useMemo(
    () => (session?.statements ?? []).flatMap((statement) => statement.rows),
    [session],
  );

  const stagedDiscardIds = useMemo(
    () => new Set(uniqueIds([...staged.deleteIds, ...staged.sheetDiscardIds])),
    [staged.deleteIds, staged.sheetDiscardIds],
  );

  const visibleRows = useMemo(
    () => pendingRows.filter((row) => !stagedDiscardIds.has(row.id)),
    [pendingRows, stagedDiscardIds],
  );

  const dayGroups = useMemo(() => groupRowsByDay(visibleRows), [visibleRows]);

  const rowById = useMemo(() => {
    const byId = new Map<string, CandidateRow>();
    for (const row of pendingRows) byId.set(row.id, row);
    return byId;
  }, [pendingRows]);

  const discardedRows = useMemo(
    () => [...stagedDiscardIds].map((id) => rowById.get(id)).filter((row): row is CandidateRow => !!row),
    [stagedDiscardIds, rowById],
  );

  // Selection can only reference rows still visible (pending, not staged for
  // discard) — filter out ids for rows moved/discarded elsewhere instead of
  // syncing selectedIds itself, so this stays a pure derivation.
  const visibleSelectedIds = useMemo(() => {
    const visibleIds = new Set(visibleRows.map((row) => row.id));
    return new Set([...selectedIds].filter((id) => visibleIds.has(id)));
  }, [visibleRows, selectedIds]);

  const commit = useFormSubmission(async () => {
    const discardIds = uniqueIds([...staged.deleteIds, ...staged.sheetDiscardIds]);
    let latest = session;
    for (const rowId of discardIds) {
      if (!latest || !sessionHasRow(latest, rowId)) continue;
      const deleted = await deleteRow(sessionId, rowId, reviewMessages);
      if (!deleted.ok) {
        if (deleted.error === reviewMessages.errorRowNotAvailable) continue;
        return deleted;
      }
      latest = deleted.session;
      if (mountedRef.current) setSession(latest);
    }

    const stillPending = (latest?.statements ?? []).flatMap((statement) => statement.rows);
    let result;
    if (stillPending.length === 0) {
      result = await finalizeSession(sessionId, reviewMessages);
      if (result.ok) {
        clearStagedImportDiscards(sessionId);
        removeUploadQueueSession(sessionId);
        if (!mountedRef.current) return { ok: true as const };
        await routeAfterImportLanding(router, listId);
        return { ok: true as const };
      }
      return result;
    }
    result = await bulkCommitSession(sessionId, listId, bulkCommitMessages);
    if (result.ok) {
      clearStagedImportDiscards(sessionId);
      removeUploadQueueSession(sessionId);
      if (mountedRef.current) {
        await routeAfterImportLanding(router, result.result.list_id);
      }
    }
    return result;
  });

  function toggleRowSelected(rowId: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  function stageDiscard(rowIds: string[]) {
    stageSheetDiscards(sessionId, rowIds);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of rowIds) next.delete(id);
      return next;
    });
  }

  function restoreDiscarded(rowId: string) {
    restoreStagedDiscard(sessionId, rowId);
  }

  const listOptions = (lists ?? []).map((l) => ({ value: l.id, label: l.name }));
  const chipOptions: ChipOption[] = [
    { value: "", label: t.bulkAssignChooseListPlaceholder, tone: "warning" },
    ...listOptions,
  ];
  const failedStatement = nextUnacknowledgedFailedStatement(session, acknowledgedFailedIds);
  const busy = commit.pending;
  const errorMessage = rowActionError ?? commit.error;

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
        defaultListId={listId || null}
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

  const selectionBar =
    visibleSelectedIds.size > 0 ? (
      <div className="flex w-full items-center gap-2">
        <span className="text-[0.8rem] text-muted">
          {t.bulkReviewSelectedCount.replace("{count}", String(visibleSelectedIds.size))}
        </span>
        <div className="ml-auto flex flex-1 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => stageDiscard([...visibleSelectedIds])}
            className={`${STICKY_BUTTON_CLASS} border-owe text-owe`}
            style={STICKY_BUTTON_STYLE}
          >
            {t.bulkReviewBulkDelete}
          </button>
        </div>
      </div>
    ) : null;

  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) router.push("/upload");
      }}
      closeLabel={t.importReviewSheetClose}
      title={t.bulkReviewTitle}
      fillBelowChrome
      body={
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
          {listsError ? (
            <p className="text-owe text-[0.9rem] m-0" role="alert">
              {listsError}
            </p>
          ) : null}

          <div className="mb-3 flex shrink-0 flex-col gap-1.5">
            <span className="text-[0.8rem] font-[550] text-foreground">
              {t.bulkAssignChooseListLabel}
            </span>
            {lists === null && !listsError ? (
              <span
                className="grid size-5 place-items-center text-muted"
                aria-label={t.bulkReviewLoadingLists}
                aria-busy="true"
              >
                <SpinnerIcon className="size-5 animate-spin motion-reduce:animate-none" />
              </span>
            ) : (
              <SingleChipPicker
                options={chipOptions}
                selectedValue={listId}
                onSelect={setListId}
                ariaLabel={t.bulkAssignChooseListLabel}
                disabled={busy}
              />
            )}
          </div>

          {errorMessage ? (
            <p role="alert" className="m-0 shrink-0 pb-3 text-owe text-[0.85rem]">
              {errorMessage}
            </p>
          ) : null}

          {selectionBar ? (
            <div className="sticky top-0 z-10 shrink-0 bg-surface pb-3">{selectionBar}</div>
          ) : null}

          {dayGroups.length === 0 && discardedRows.length === 0 ? (
            <p className="m-0 text-muted text-[0.85rem]">{t.importReviewSheetEmpty}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {dayGroups.map((day) => (
                <div key={day.dateKey || "unknown"} className="flex flex-col gap-1.5">
                  <h4 className="m-0 text-[0.78rem] font-[550] text-muted">
                    {dayHeading(day.dateKey, locale, t.importReviewSheetUnknownDate)}
                  </h4>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {day.rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2"
                      >
                        <SoftLedgerRadio
                          type="checkbox"
                          className="shrink-0"
                          checked={visibleSelectedIds.has(row.id)}
                          disabled={busy}
                          aria-label={row.description}
                          onChange={(event) => toggleRowSelected(row.id, event.target.checked)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-[0.9rem] font-[550] text-foreground">
                            {row.description}
                          </p>
                          <p className="m-0 text-[0.78rem] text-muted">
                            {formatRowAmount(row.amount, row.currency, locale)}
                          </p>
                        </div>
                        <IconButton
                          variant="ghost"
                          disabled={busy}
                          onClick={() => stageDiscard([row.id])}
                          label={t.bulkReviewDeleteRow}
                          icon={<TrashIcon className="w-4 h-4" />}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {discardedRows.length > 0 ? (
                <section
                  className="flex flex-col gap-2 rounded-sm border border-owe p-3"
                  aria-labelledby="bulk-assign-discarded-heading"
                >
                  <h3
                    id="bulk-assign-discarded-heading"
                    className="m-0 text-[0.85rem] font-[600] text-owe"
                  >
                    {t.importReviewSheetDiscardedHeading}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {discardedRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 rounded-sm bg-surface px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-[0.9rem] font-[550] text-foreground">
                            {row.description}
                          </p>
                          <p className="m-0 text-[0.78rem] text-muted">
                            {formatRowAmount(row.amount, row.currency, locale)}
                            {row.posted_date ? ` · ${formatRowDate(row.posted_date, locale)}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => restoreDiscarded(row.id)}
                          className="m-0 shrink-0 cursor-pointer border-0 bg-transparent p-0 text-[0.85rem] font-[550] text-accent disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          {t.importReviewSheetRestore}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )}
        </div>
      }
      footer={
        <PrimaryButton
          className="w-full"
          disabled={!listId || busy}
          loading={commit.pending}
          onClick={() => {
            setRowActionError(null);
            commit.submit(undefined);
          }}
        >
          {commit.pending ? t.bulkReviewCommitting : t.bulkReviewConfirm}
        </PrimaryButton>
      }
    />
  );
}
