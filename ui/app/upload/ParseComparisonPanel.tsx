"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
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
  onContinue: () => void;
  onDismissStatement: (session: ImportSession) => void;
  onDismissFile: () => void;
};

const destructiveOutlineClass =
  "m-0 px-3 py-[9px] rounded-sm border border-owe bg-transparent text-owe cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-owe disabled:opacity-55 disabled:cursor-not-allowed";

export function ParseComparisonPanel({
  sessionId,
  statement,
  locale,
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

  return (
    <div className="flex min-h-[100dvh] flex-col gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-4)] md:min-h-[70vh] md:flex-row md:items-stretch">
      <p className="m-0 text-[0.9rem] text-foreground md:hidden" role="alert">
        {t.parseFailureAlert}
      </p>
      <section
        className="flex max-h-[50vh] min-h-0 flex-col gap-[var(--space-3)] overflow-auto md:max-h-none md:flex-1"
        role="region"
        aria-label={t.parseFailureItemsRegion}
      >
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
          <PrimaryButton onClick={onContinue} disabled={pending}>
            {t.parseFailureContinue}
          </PrimaryButton>
        </div>
      </section>
      <section
        ref={pdfPaneRef}
        className="flex min-h-[50vh] flex-1 flex-col overflow-auto border border-border bg-surface md:min-h-0"
        role="region"
        aria-label={t.parseFailurePdfRegion}
      >
        <h2 className="m-0 px-[var(--space-3)] py-[var(--space-2)] text-[0.85rem] font-[550] text-foreground">
          {t.parseFailurePdfRegion}
        </h2>
        {pdfError ? (
          <p className="m-0 px-[var(--space-3)] text-muted">{t.parseFailurePdfError}</p>
        ) : !file ? (
          <p className="m-0 px-[var(--space-3)] text-muted">{t.parseFailurePdfLoading}</p>
        ) : (
          <Document
            file={file}
            onLoadSuccess={({ numPages: count }) => setNumPages(count)}
            onLoadError={() => setPdfError(true)}
            loading={t.parseFailurePdfLoading}
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
