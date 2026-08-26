"use client";

import { useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { uploadCopy } from "@/lib/i18n/upload";
import type { Locale } from "@/lib/i18n/locale";
import type { StagedStatement } from "./uploadClient";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type ParseComparisonPanelProps = {
  sessionId: string;
  statement: StagedStatement;
  locale: Locale;
  onContinue: () => void;
};

export function ParseComparisonPanel({
  sessionId,
  statement,
  locale,
  onContinue,
}: ParseComparisonPanelProps) {
  const t = uploadCopy(locale);
  const [file, setFile] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [numPages, setNumPages] = useState(0);

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

  const items = statement.parse_evidence?.items ?? [];

  return (
    <div className="flex min-h-[70vh] flex-col gap-[var(--space-4)] px-[var(--space-4)] py-[var(--space-4)] md:flex-row md:items-stretch">
      <p className="m-0 text-[0.9rem] text-foreground md:hidden" role="alert">
        {t.parseFailureAlert}
      </p>
      <section
        className="flex min-h-0 flex-1 flex-col gap-[var(--space-3)] overflow-auto"
        role="region"
        aria-label={t.parseFailureItemsRegion}
      >
        <p className="m-0 hidden text-[0.9rem] text-foreground md:block" role="alert">
          {t.parseFailureAlert}
        </p>
        <h2 className="m-0 text-[0.85rem] font-[550] text-foreground">{t.parseFailureItemsRegion}</h2>
        <ul className="m-0 flex list-none flex-col gap-[var(--space-2)] p-0">
          {items.map((item, index) =>
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
          )}
        </ul>
        <PrimaryButton onClick={onContinue}>{t.parseFailureContinue}</PrimaryButton>
      </section>
      <section
        className="flex min-h-[40vh] flex-1 flex-col overflow-auto border border-border bg-surface md:min-h-0"
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
            loading={t.parseFailurePdfLoading}
          >
            {Array.from({ length: numPages }, (_, page) => (
              <Page key={page + 1} pageNumber={page + 1} width={360} />
            ))}
          </Document>
        )}
      </section>
    </div>
  );
}
