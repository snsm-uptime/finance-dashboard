"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Sheet } from "@/app/lists/Sheet";
import { IconButton } from "@/components/IconButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerRadio } from "@/components/soft-ledger/Radio";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import type { ListItem } from "@/app/lists/listsClient";
import { TrashIcon } from "@/app/icons";
import { uploadCopy } from "@/lib/i18n/upload";
import type { Locale } from "@/lib/i18n/locale";
import {
  deleteRow,
  finalizeSession,
  unassignRow,
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
import { formatRowAmount, formatRowDate } from "./IndividualReviewPanel";

type ImportReviewSheetProps = {
  sessionId: string;
  session: ImportSession;
  /** From the panel's already-loaded fetchLists (Task 3.2) — no second endpoint. */
  lists: ListItem[] | null;
  onSessionUpdate: (session: ImportSession) => void;
  /** Close control / backdrop / Esc only. Never finalizes or discards (AC #6). */
  onClose: () => void;
};

export type DayGroup = {
  /** `YYYY-MM-DD`, or `""` when `posted_date` is missing/unparseable. */
  dateKey: string;
  rows: CandidateRow[];
};

export type ListGroup = {
  listId: string;
  listName: string;
  days: DayGroup[];
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function postedDateKey(postedDate: string | undefined): string {
  const match = ISO_DAY.exec(postedDate ?? "");
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

/**
 * Sequence-sorted rows → day buckets. Known days are chronological; rows
 * with a missing/unparseable `posted_date` go last and keep sequence order.
 */
export function groupRowsByDay(rows: CandidateRow[]): DayGroup[] {
  const byDate = new Map<string, CandidateRow[]>();
  const unknown: CandidateRow[] = [];
  for (const row of rows) {
    const dateKey = postedDateKey(row.posted_date);
    if (!dateKey) {
      unknown.push(row);
      continue;
    }
    const existing = byDate.get(dateKey);
    if (existing) existing.push(row);
    else byDate.set(dateKey, [row]);
  }
  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayRows]) => ({ dateKey, rows: dayRows }));
  if (unknown.length) days.push({ dateKey: "", rows: unknown });
  return days;
}

/**
 * Groups `assigned_rows` across every statement by `resolved_list_id` (AC
 * #1), then by posted day. A row missing `resolved_list_id` cannot happen
 * for a committed row — skipped defensively rather than asserted, since
 * this is display code.
 */
export function groupAssignedRows(session: ImportSession, lists: ListItem[] | null): ListGroup[] {
  const nameById = new Map((lists ?? []).map((list) => [list.id, list.name]));
  const byList = new Map<string, CandidateRow[]>();
  for (const statement of session.statements) {
    for (const row of statement.assigned_rows) {
      const listId = row.resolved_list_id;
      if (!listId) continue;
      const existing = byList.get(listId);
      if (existing) existing.push(row);
      else byList.set(listId, [row]);
    }
  }
  const groups: ListGroup[] = [];
  for (const [listId, rows] of byList) {
    rows.sort((a, b) => a.sequence - b.sequence);
    groups.push({
      listId,
      listName: nameById.get(listId) ?? listId,
      days: groupRowsByDay(rows),
    });
  }
  groups.sort((a, b) => a.listName.localeCompare(b.listName));
  return groups;
}

/** Drops staged-discarded rows and any day/list buckets that become empty. */
export function omitDiscardedRows(groups: ListGroup[], discardedIds: Set<string>): ListGroup[] {
  if (discardedIds.size === 0) return groups;
  const remaining: ListGroup[] = [];
  for (const group of groups) {
    const days: DayGroup[] = [];
    for (const day of group.days) {
      const rows = day.rows.filter((row) => !discardedIds.has(row.id));
      if (rows.length) days.push({ dateKey: day.dateKey, rows });
    }
    if (days.length) remaining.push({ listId: group.listId, listName: group.listName, days });
  }
  return remaining;
}

function dayHeading(dateKey: string, locale: Locale, unknownDateLabel: string): string {
  return dateKey ? formatRowDate(dateKey, locale) : unknownDateLabel;
}

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

function pendingRowIds(session: ImportSession): string[] {
  const ids: string[] = [];
  for (const statement of session.statements) {
    for (const row of statement.rows) ids.push(row.id);
  }
  return ids;
}

function sessionHasRow(session: ImportSession, rowId: string): boolean {
  for (const statement of session.statements) {
    if (statement.rows.some((row) => row.id === rowId)) return true;
    if (statement.assigned_rows.some((row) => row.id === rowId)) return true;
  }
  return false;
}

/**
 * Confirm gate after individual review (Story 4.13.1): assigned rows grouped
 * by destination list and posted day, Save pinned in the sheet footer,
 * per-row and multi-select discard staged locally (suppressed for
 * dedup_skipped rows) until Save deletes staged discards then finalizes
 * (AC 7 / Task 6.5) — the real `ImportCompletionSummary`, mounted by
 * `IndividualReviewPanel` once `session.finalized_at` is set, is what
 * renders next; this sheet does not preview it. Reuses the existing `Sheet`
 * — no new portal/focus trap — and Tailwind + Warm Balance tokens only, per
 * AD-23.
 */
export function ImportReviewSheet({
  sessionId,
  session,
  lists,
  onSessionUpdate,
  onClose,
}: ImportReviewSheetProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const { staged } = useStagedImportDiscards(sessionId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Save/Change List keep awaiting network calls after Close/Esc/backdrop
  // unmounts the sheet; skip onSessionUpdate so a late success does not
  // write into an unmounted tree.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const messages: IndividualReviewMessages = {
    errorForbidden: t.individualReviewErrorForbidden,
    errorSessionNotFound: t.individualReviewErrorSessionNotFound,
    errorStatementNotFound: t.individualReviewErrorStatementNotFound,
    errorSessionDiscarded: t.individualReviewErrorSessionDiscarded,
    errorStatementNotAvailable: t.individualReviewErrorStatementNotAvailable,
    errorRowNotFound: t.individualReviewErrorRowNotFound,
    errorRowNotAvailable: t.individualReviewErrorRowNotAvailable,
    errorNothingToUndo: t.individualReviewErrorNothingToUndo,
    errorSessionHasPendingRows: t.individualReviewErrorSessionHasPendingRows,
    errorRowNotDiscardable: t.individualReviewErrorRowNotDiscardable,
    errorFxUnavailable: t.individualReviewErrorFxUnavailable,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  const assignedGroups = useMemo(() => groupAssignedRows(session, lists), [session, lists]);
  const assignedById = useMemo(() => {
    const byId = new Map<string, CandidateRow>();
    for (const statement of session.statements) {
      for (const row of statement.assigned_rows) {
        byId.set(row.id, row);
      }
    }
    return byId;
  }, [session]);

  const pendingById = useMemo(() => {
    const byId = new Map<string, CandidateRow>();
    for (const statement of session.statements) {
      for (const row of statement.rows) {
        byId.set(row.id, row);
      }
    }
    return byId;
  }, [session]);

  const liveUnassignIds = useMemo(() => {
    const live = new Set<string>();
    for (const id of staged.sheetDiscardIds) {
      if (assignedById.has(id)) live.add(id);
    }
    return live;
  }, [staged.sheetDiscardIds, assignedById]);

  const groups = useMemo(
    () => omitDiscardedRows(assignedGroups, liveUnassignIds),
    [assignedGroups, liveUnassignIds],
  );

  const discardedRows = useMemo(() => {
    const rows: CandidateRow[] = [];
    const seen = new Set<string>();
    for (const id of [...staged.sheetDiscardIds, ...staged.deleteIds]) {
      if (seen.has(id)) continue;
      const row = assignedById.get(id) ?? pendingById.get(id);
      if (!row) continue;
      seen.add(id);
      rows.push(row);
    }
    return rows;
  }, [staged.sheetDiscardIds, staged.deleteIds, assignedById, pendingById]);

  const discardableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of groups) {
      for (const day of group.days) {
        for (const row of day.rows) {
          if (!row.dedup_skipped) ids.add(row.id);
        }
      }
    }
    return ids;
  }, [groups]);

  const selectedDiscardableIds = useMemo(
    () => [...selectedIds].filter((id) => discardableIds.has(id)),
    [selectedIds, discardableIds],
  );

  const saveAction = useFormSubmission(async () => {
    const discardIds = uniqueIds([...staged.deleteIds, ...staged.sheetDiscardIds]);
    const unstagedPending = pendingRowIds(session).filter((rowId) => !discardIds.includes(rowId));
    if (unstagedPending.length) {
      console.error(
        "import save: pending rows were not staged as discarded; sheet should not have opened",
        unstagedPending,
      );
      return { ok: false as const, error: t.errorGeneric };
    }

    let latest = session;
    for (const rowId of discardIds) {
      if (!sessionHasRow(latest, rowId)) continue;
      const deleted = await deleteRow(sessionId, rowId, messages);
      if (!deleted.ok) {
        // A stray reentrant Save (or a retry after an earlier attempt that
        // actually succeeded server-side before erroring locally) can ask to
        // delete a row that's already gone — the server 409s with this exact
        // message rather than treating delete as idempotent. Since the row
        // is already gone either way, that's not a real failure here.
        if (deleted.error === messages.errorRowNotAvailable) continue;
        return deleted;
      }
      latest = deleted.session;
      onSessionUpdate(latest);
    }

    // finalizeSession is the source of truth for "no pending rows remain" —
    // it rejects with errorSessionHasPendingRows otherwise. An extra
    // fetchImportSession-then-recheck here used to gate this call: any lag
    // between that read and the deletes just above could see a still-stale
    // pending row and abort with a generic error, silently skipping finalize
    // and requiring a second Save click to actually persist the session.
    const result = await finalizeSession(sessionId, messages);
    if (result.ok) {
      clearStagedImportDiscards(sessionId);
      removeUploadQueueSession(sessionId);
      if (mountedRef.current) {
        onSessionUpdate(result.session);
      }
    }
    return result;
  });

  const changeListAction = useFormSubmission(async () => {
    const selected = [...selectedDiscardableIds];
    for (const rowId of selected) {
      const result = await unassignRow(sessionId, rowId, messages);
      if (!result.ok) return result;
      onSessionUpdate(result.session);
    }
    return { ok: true as const };
  });

  function setRowSelected(rowId: string, selected: boolean) {
    if (!discardableIds.has(rowId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  function stageDiscard(rowIds: string[]) {
    const eligible = rowIds.filter((id) => discardableIds.has(id) || liveUnassignIds.has(id));
    if (eligible.length === 0) return;
    stageSheetDiscards(sessionId, eligible);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of eligible) next.delete(id);
      return next;
    });
  }

  function restoreDiscarded(rowId: string) {
    restoreStagedDiscard(sessionId, rowId);
  }

  const busy = saveAction.pending || changeListAction.pending;
  const errorMessage = saveAction.error ?? changeListAction.error;

  const STICKY_BUTTON_CLASS =
    "m-0 flex-1 cursor-pointer rounded-sm border bg-surface px-3 py-[9px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 enabled:hover:brightness-105";
  const STICKY_BUTTON_STYLE = {
    fontFamily: "var(--type-button-face)",
    fontSize: "var(--type-button-size)",
    fontWeight: "var(--type-button-weight)",
    lineHeight: "1.2",
  } as const;

  const selectionBar =
    selectedDiscardableIds.length > 0 ? (
      <div className="flex w-full gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => stageDiscard(selectedDiscardableIds)}
          className={`${STICKY_BUTTON_CLASS} border-owe text-owe`}
          style={STICKY_BUTTON_STYLE}
        >
          {t.importReviewSheetDiscard}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            saveAction.clearError();
            void changeListAction.submit(undefined);
          }}
          className={`${STICKY_BUTTON_CLASS} border-border text-foreground`}
          style={STICKY_BUTTON_STYLE}
        >
          {changeListAction.pending
            ? t.importReviewSheetChangingList
            : t.importReviewSheetChangeList}
        </button>
      </div>
    ) : null;

  return (
    <Sheet
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      closeLabel={t.importReviewSheetClose}
      title={t.importReviewSheetTitle}
      fillBelowChrome
      body={
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
          {errorMessage ? (
            <p role="alert" className="m-0 shrink-0 pb-3 text-owe text-[0.85rem]">
              {errorMessage}
            </p>
          ) : null}

          {selectionBar ? (
            <div className="sticky top-0 z-10 shrink-0 bg-surface pb-3">
              {selectionBar}
            </div>
          ) : null}

          {groups.length === 0 && discardedRows.length === 0 ? (
            <p className="m-0 text-muted text-[0.85rem]">{t.importReviewSheetEmpty}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              {groups.map((group) => (
                <div key={group.listId} className="flex flex-col gap-2">
                  <h3 className="m-0 text-[0.85rem] font-[600] text-foreground">
                    {group.listName}
                  </h3>
                  {group.days.map((day) => (
                    <div
                      key={day.dateKey || "unknown"}
                      className="flex flex-col gap-1.5"
                    >
                      <h4 className="m-0 text-[0.78rem] font-[550] text-muted">
                        {dayHeading(day.dateKey, locale, t.importReviewSheetUnknownDate)}
                      </h4>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {day.rows.map((row) => {
                          const discardable = !row.dedup_skipped;
                          return (
                            <li
                              key={row.id}
                              className="flex items-center justify-between gap-3 rounded-sm border border-border bg-surface px-3 py-2"
                            >
                              <SoftLedgerRadio
                                type="checkbox"
                                className="shrink-0"
                                checked={selectedDiscardableIds.includes(row.id)}
                                disabled={busy || !discardable}
                                aria-label={row.description}
                                onChange={(event) =>
                                  setRowSelected(row.id, event.target.checked)
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <p className="m-0 truncate text-[0.9rem] font-[550] text-foreground">
                                  {row.description}
                                </p>
                                <p className="m-0 text-[0.78rem] text-muted">
                                  {formatRowAmount(row.amount, row.currency, locale)}
                                </p>
                              </div>
                              {discardable ? (
                                <IconButton
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => stageDiscard([row.id])}
                                  label={t.importReviewSheetDiscard}
                                  icon={<TrashIcon className="w-4 h-4" />}
                                />
                              ) : (
                                <span className="shrink-0 text-[0.78rem] text-muted">
                                  {t.importReviewSheetAlreadyInList}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
              {discardedRows.length > 0 ? (
                <section
                  className="flex flex-col gap-2 rounded-sm border border-owe p-3"
                  aria-labelledby="import-review-discarded-heading"
                >
                  <h3
                    id="import-review-discarded-heading"
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
                            {row.posted_date
                              ? ` · ${formatRowDate(row.posted_date, locale)}`
                              : ""}
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
          disabled={busy}
          onClick={() => {
            changeListAction.clearError();
            void saveAction.submit(undefined);
          }}
        >
          {saveAction.pending ? t.importReviewSheetSaving : t.importReviewSheetSave}
        </PrimaryButton>
      }
    />
  );
}
