"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import { BackIcon, SpinnerIcon } from "@/app/icons";
import { FormIconSubmit } from "@/components/FormIconSubmit";
import { useOptionalPreferences } from "@/components/PreferencesProvider";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { ManualExpenseForm, type ManualExpenseInitialValues } from "@/app/lists/ManualExpenseForm";
import {
  fetchListMembers,
  fetchLists,
  type ListMember,
  type ListsClientMessages,
} from "@/app/lists/listsClient";
import { listsMessages } from "@/lib/i18n/lists";
import { uploadCopy } from "@/lib/i18n/upload";
import type { Locale } from "@/lib/i18n/locale";
import { DiscardConfirmDialog } from "./DiscardConfirmDialog";
import {
  discardSession,
  dismissFailedStatement,
  type ImportSession,
  type StagedStatement,
} from "./uploadClient";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type ParseComparisonPanelProps = {
  sessionId: string;
  statement: StagedStatement;
  locale: Locale;
  /** Import session's already-resolved target list, if any (e.g.
   * session.landing_list_id in individual review, or the bulk-review list
   * picker's current value) — pre-selects the manual-entry list dropdown. */
  defaultListId?: string | null;
  onContinue: () => void;
  onDismissStatement: (session: ImportSession) => void;
  onDismissFile: () => void;
};

const destructiveOutlineClass =
  "m-0 px-3 py-[9px] rounded-sm border border-owe bg-transparent text-owe cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-owe disabled:opacity-55 disabled:cursor-not-allowed";

function initialValuesFrom(statement: StagedStatement): ManualExpenseInitialValues | undefined {
  const row = (statement.parse_evidence?.items ?? []).find((item) => item.kind === "row");
  if (!row) return undefined;
  return {
    amount: row.amount ?? undefined,
    description: row.description ?? undefined,
    currency: row.currency ?? undefined,
    postedDate: row.posted_date ?? undefined,
  };
}

type ManualEntryColumnProps = {
  sessionId: string;
  statement: StagedStatement;
  locale: Locale;
  defaultListId: string | null;
  onClose: () => void;
  onResolved: (session: ImportSession) => void;
};

/** Inline manual-entry column: list picker + ManualExpenseForm, visible
 * immediately (no gating on list/members loaded — FR-55). Submit creates the
 * expense then dismisses the failed statement in the same flow (AC #5). */
function ManualEntryColumn({
  sessionId,
  statement,
  locale,
  defaultListId,
  onClose,
  onResolved,
}: ManualEntryColumnProps) {
  const t = uploadCopy(locale);
  const lt = listsMessages[locale];
  const currentUserId = useOptionalPreferences()?.me?.user_id ?? "";
  const formRef = useRef<HTMLFormElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const [listId, setListId] = useState(defaultListId ?? "");
  const [listOptions, setListOptions] = useState<{ value: string; label: string }[]>([]);
  const [members, setMembers] = useState<ListMember[]>([]);
  /** Which listId `members` was last fetched for — lets the payer options
   * stay empty (not omitted) until membership for the chosen list arrives,
   * without a separate loading boolean. */
  const [membersListId, setMembersListId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Bumped by the retry button to re-run the list/members fetch effects
   * below after a transient network failure. */
  const [reloadKey, setReloadKey] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  /** Set once the expense has been created but dismissing the statement then
   * failed — blocks resubmitting the form (which would create a duplicate
   * expense) and instead offers a dismiss-only retry (AC #5). */
  const [dismissFailed, setDismissFailed] = useState(false);

  const dismissMessages = {
    errorUnauthorized: t.errorUnauthorized,
    errorGeneric: t.errorGeneric,
    errorSessionDiscarded: t.individualReviewErrorSessionDiscarded,
    errorStatementNotFailed: t.parseFailureErrorNotFailed,
  };

  const listsClientMessages: ListsClientMessages = {
    errorGeneric: lt.errorGeneric,
    errorInvalidName: lt.errorInvalidName,
    errorForbidden: lt.errorForbidden,
    errorUnauthorized: lt.errorUnauthorized,
  };

  useEffect(() => {
    let cancelled = false;
    fetchLists(listsClientMessages).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setListOptions(result.lists.map((l) => ({ value: l.id, label: l.name })));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    fetchListMembers(listId, listsClientMessages).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setLoadError(result.error);
        setMembers([]);
        setMembersListId(listId);
        return;
      }
      setLoadError(null);
      setMembers(result.members);
      setMembersListId(listId);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, reloadKey]);

  async function handleSuccess() {
    setDismissing(true);
    setLoadError(null);
    const result = await dismissFailedStatement(sessionId, statement.id, dismissMessages);
    setDismissing(false);
    if (!result.ok) {
      setLoadError(result.error);
      setDismissFailed(true);
      return;
    }
    onResolved(result.session);
  }

  const initialValues = initialValuesFrom(statement);
  const currentMembers = listId && membersListId === listId ? members : [];

  return (
    <section
      className="flex min-h-[50vh] flex-1 flex-col gap-[var(--space-3)] overflow-auto md:order-2 md:min-h-0"
      role="region"
      aria-label={t.parseFailureManualEntryRegion}
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <h2 className="m-0 text-[0.85rem] font-[550] text-foreground">
          {t.parseFailureManualEntryRegion}
        </h2>
        <GhostButton type="button" disabled={dismissing} onClick={onClose}>
          <BackIcon className="h-4 w-4" />
          {t.manualEntryBack}
        </GhostButton>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[0.8rem] text-muted">{t.manualEntryChooseList}</span>
        <SoftLedgerSelect
          value={listId}
          options={listOptions}
          disabled={dismissing}
          aria-label={t.manualEntryChooseList}
          onChange={setListId}
        />
      </div>
      {loadError ? (
        <div className="flex items-center gap-[var(--space-2)]">
          <p className="m-0 text-[0.85rem] text-owe" role="alert">
            {loadError}
          </p>
          {!dismissFailed ? (
            <GhostButton
              type="button"
              disabled={dismissing}
              onClick={() => setReloadKey((k) => k + 1)}
            >
              {t.manualEntryLoadRetry}
            </GhostButton>
          ) : null}
        </div>
      ) : null}
      {dismissFailed ? (
        <GhostButton type="button" disabled={dismissing} onClick={() => void handleSuccess()}>
          {t.manualEntryDismissRetry}
        </GhostButton>
      ) : currentUserId ? (
        <>
          <ManualExpenseForm
            listId={listId}
            currentUserId={currentUserId}
            members={currentMembers}
            messages={{
              ...lt,
              expenseTitle: t.parseFailureManualEntryRegion,
            }}
            initialValues={initialValues}
            formRef={formRef}
            onSuccess={() => void handleSuccess()}
            onCanSubmitChange={setCanSubmit}
          />
          <FormIconSubmit
            type="button"
            variant="save"
            label={t.manualEntrySave}
            disabled={!canSubmit || !listId || dismissing}
            onClick={() => formRef.current?.requestSubmit()}
          />
        </>
      ) : (
        <span
          className="grid place-items-center py-[var(--space-3)] text-muted"
          aria-label={t.manualEntryLoadingUser}
          aria-busy="true"
        >
          <SpinnerIcon className="size-6 animate-spin motion-reduce:animate-none" />
        </span>
      )}
    </section>
  );
}

export function ParseComparisonPanel({
  sessionId,
  statement,
  locale,
  defaultListId = null,
  onContinue,
  onDismissStatement,
  onDismissFile,
}: ParseComparisonPanelProps) {
  const t = uploadCopy(locale);
  const [file, setFile] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [pageWidth, setPageWidth] = useState(320);
  const pdfPaneRef = useRef<HTMLElement>(null);
  const [confirmFile, setConfirmFile] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/import/sessions/${encodeURIComponent(sessionId)}/statements/${encodeURIComponent(statement.id)}/pdf`,
      { credentials: "include", cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("pdf");
        return response.blob();
      })
      .then((blob) => {
        if (!cancelled) setFile(blob);
      })
      .catch(() => {
        if (!cancelled) setPdfError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, statement.id]);

  useEffect(() => {
    const el = pdfPaneRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setPageWidth(Math.max(160, Math.floor(width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [file, pdfError]);

  const items = statement.parse_evidence?.items ?? [];
  const dismissMessages = {
    errorUnauthorized: t.errorUnauthorized,
    errorGeneric: t.errorGeneric,
    errorSessionDiscarded: t.individualReviewErrorSessionDiscarded,
    errorStatementNotFailed: t.parseFailureErrorNotFailed,
  };

  async function handleDismissStatement() {
    setPending(true);
    setActionError(null);
    const result = await dismissFailedStatement(sessionId, statement.id, dismissMessages);
    setPending(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    onDismissStatement(result.session);
  }

  async function handleDismissFile() {
    setPending(true);
    setActionError(null);
    const result = await discardSession(sessionId, {
      errorUnsupportedFileType: t.errorUnsupportedFileType,
      errorUnknownStatement: t.errorUnknownStatement,
      errorAmbiguousStatement: t.errorAmbiguousStatement,
      errorUnreadableStatement: t.errorUnreadableStatement,
      errorDuplicateStatement: t.errorDuplicateStatement,
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
    });
    setPending(false);
    setConfirmFile(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    onDismissFile();
  }

  const itemsSectionClass = `${manualEntryOpen ? "hidden md:flex" : "flex"} max-h-[50vh] min-h-0 flex-col gap-[var(--space-3)] overflow-auto md:max-h-none md:flex-1`;

  return (
    <div className="flex min-h-[100dvh] flex-col gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-4)] md:min-h-[70vh] md:flex-row md:items-stretch">
      <p className="m-0 text-[0.9rem] text-foreground md:hidden" role="alert">
        {t.parseFailureAlert}
      </p>
      <section className={itemsSectionClass} role="region" aria-label={t.parseFailureItemsRegion}>
        <p className="m-0 hidden text-[0.9rem] text-foreground md:block" role="alert">
          {t.parseFailureAlert}
        </p>
        <h2 className="m-0 text-[0.85rem] font-[550] text-foreground">{t.parseFailureItemsRegion}</h2>
        <ul className="m-0 flex list-none flex-col gap-[var(--space-2)] p-0">
          {items.length === 0 ? (
            <li className="rounded-[8px] border border-border bg-background px-[var(--space-3)] py-[var(--space-2)] text-muted">
              <span className="text-[0.75rem] font-[550] uppercase tracking-[0.04em]">
                {t.parseFailureGapLabel}
              </span>
              <p className="m-0 mt-1 break-words text-[0.85rem]">{t.parseFailureEmptyEvidence}</p>
            </li>
          ) : (
            items.map((item, index) =>
              item.kind === "gap" ? (
                <li
                  key={`gap-${index}`}
                  className="rounded-[8px] border border-border bg-background px-[var(--space-3)] py-[var(--space-2)] text-muted"
                >
                  <span className="text-[0.75rem] font-[550] uppercase tracking-[0.04em]">
                    {t.parseFailureGapLabel}
                  </span>
                  <p className="m-0 mt-1 break-words text-[0.85rem]">{item.raw_snippet}</p>
                </li>
              ) : (
                <li
                  key={`row-${index}`}
                  className="rounded-[8px] border border-border bg-surface px-[var(--space-3)] py-[var(--space-2)] text-foreground"
                >
                  <p className="m-0 text-[0.9rem] font-[550]">{item.description}</p>
                  <p className="m-0 text-[0.8rem] text-muted">
                    {item.posted_date} · {item.currency} {item.amount}
                  </p>
                </li>
              ),
            )
          )}
        </ul>
        {actionError ? (
          <p className="m-0 text-[0.9rem] text-owe" role="alert">
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-[var(--space-2)]">
          <GhostButton
            disabled={pending}
            onClick={() => void handleDismissStatement()}
          >
            {t.parseFailureDismissStatement}
          </GhostButton>
          <button
            type="button"
            className={destructiveOutlineClass}
            style={{
              fontFamily: "var(--type-button-face)",
              fontSize: "var(--type-button-size)",
              fontWeight: "var(--type-button-weight)",
              lineHeight: "1.2",
            }}
            disabled={pending}
            onClick={() => setConfirmFile(true)}
          >
            {t.parseFailureDismissFile}
          </button>
          <GhostButton disabled={pending} onClick={() => setManualEntryOpen(true)}>
            {t.parseFailureAddManually}
          </GhostButton>
          <PrimaryButton onClick={onContinue} disabled={pending}>
            {t.parseFailureContinue}
          </PrimaryButton>
        </div>
      </section>
      {manualEntryOpen ? (
        <ManualEntryColumn
          sessionId={sessionId}
          statement={statement}
          locale={locale}
          defaultListId={defaultListId}
          onClose={() => setManualEntryOpen(false)}
          onResolved={(session) => {
            setManualEntryOpen(false);
            onDismissStatement(session);
          }}
        />
      ) : null}
      <section
        ref={pdfPaneRef}
        className="flex min-h-[50vh] flex-1 flex-col overflow-auto border border-border bg-surface md:order-1 md:min-h-0"
        role="region"
        aria-label={t.parseFailurePdfRegion}
      >
        <h2 className="m-0 px-[var(--space-3)] py-[var(--space-2)] text-[0.85rem] font-[550] text-foreground">
          {statement.filename ?? t.parseFailurePdfRegion}
        </h2>
        {pdfError ? (
          <p className="m-0 px-[var(--space-3)] text-muted">{t.parseFailurePdfError}</p>
        ) : !file ? (
          <div
            className="flex justify-center px-[var(--space-3)] py-[var(--space-2)] text-muted"
            role="status"
            aria-label={t.parseFailurePdfLoading}
          >
            <SpinnerIcon className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <Document
            file={file}
            onLoadSuccess={({ numPages: count }) => setNumPages(count)}
            onLoadError={() => setPdfError(true)}
            loading={
              <div
                className="flex justify-center px-[var(--space-3)] py-[var(--space-2)] text-muted"
                role="status"
                aria-label={t.parseFailurePdfLoading}
              >
                <SpinnerIcon className="h-5 w-5 animate-spin" />
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, page) => (
              <Page key={page + 1} pageNumber={page + 1} width={pageWidth} />
            ))}
          </Document>
        )}
      </section>
      <DiscardConfirmDialog
        open={confirmFile}
        title={t.discardConfirmTitle}
        body={t.discardConfirmBody}
        confirmLabel={t.discardConfirmAction}
        cancelLabel={t.discardCancel}
        pending={pending}
        onConfirm={() => void handleDismissFile()}
        onCancel={() => setConfirmFile(false)}
      />
    </div>
  );
}
