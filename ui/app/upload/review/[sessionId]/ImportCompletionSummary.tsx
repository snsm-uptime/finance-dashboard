"use client";

import { usePreferences } from "@/components/PreferencesProvider";
import { uploadCopy } from "@/lib/i18n/upload";
import type { ImportSession } from "../../uploadClient";

const TOOTH_PX = 10;
const TOOTH_COUNT = 20;

/** Triangular sawtooth along top and bottom so page `--background` shows through. */
function receiptZigZagClipPath(teeth: number, toothPx: number): string {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= teeth; i += 1) {
    const x = `${(i / teeth) * 100}%`;
    const peak = i % 2 === 1;
    top.push(`${x} ${peak ? "0" : `${toothPx}px`}`);
    bottom.push(`${x} ${peak ? "100%" : `calc(100% - ${toothPx}px)`}`);
  }
  return `polygon(${[...top, ...bottom.reverse()].join(", ")})`;
}

const receiptClipPath = receiptZigZagClipPath(TOOTH_COUNT, TOOTH_PX);

type ImportCompletionSummaryProps = {
  session: ImportSession;
};

function ReceiptLine({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <li className="py-1.5">
      <div className="flex items-baseline gap-1">
        <span className="shrink-0">{label}</span>
        <span
          aria-hidden
          className="min-w-3 flex-1 overflow-hidden whitespace-nowrap text-[color-mix(in_srgb,currentColor_42%,transparent)]"
        >
          {".".repeat(96)}
        </span>
        <span className="shrink-0 tabular-nums">{value}</span>
      </div>
      {hint ? (
        <p
          className="m-0 mt-1 text-[0.78rem] leading-snug text-[color-mix(in_srgb,currentColor_58%,transparent)] dark:text-white/65"
        >
          {hint}
        </p>
      ) : null}
    </li>
  );
}

export function ImportCompletionSummary({ session }: ImportCompletionSummaryProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);

  return (
    <section
      aria-label={t.completionTitle}
      className="relative mx-auto mt-2 w-[min(100%-1.5rem,22rem)]"
      style={{ filter: "drop-shadow(0 10px 22px color-mix(in_srgb, var(--foreground) 14%, transparent))" }}
    >
      <div
        className={[
          "px-6 pb-8 pt-7 text-foreground",
          // Light: sand paper. Dark: darker beige with white type (not inverted white slip).
          "bg-surface",
          "dark:bg-[color-mix(in_srgb,var(--muted)_46%,var(--surface)_54%)] dark:text-white",
        ].join(" ")}
        style={{ clipPath: receiptClipPath }}
      >
        <p
          className="m-0 text-center uppercase tracking-[0.12em] text-[0.72rem] font-[550]"
          style={{ fontFamily: "var(--type-section-label-face)" }}
        >
          {t.completionTitle}
        </p>
        <div
          aria-hidden
          className="my-4 border-t border-dashed border-[color-mix(in_srgb,currentColor_32%,transparent)]"
        />
        <ul
          className="m-0 list-none p-0 text-[0.95rem] leading-relaxed"
          style={{ fontFamily: "var(--type-body-face)" }}
        >
          {session.committed_by_list.map((group) => (
            <ReceiptLine
              key={group.list_id}
              label={t.completionImportedToList.replace("{list}", group.name)}
              value={String(group.count)}
            />
          ))}
          <ReceiptLine label={t.completionDeleted} value={String(session.deleted_count)} />
          <ReceiptLine
            label={t.completionZeroExcluded}
            value={String(session.zero_amount_excluded_count)}
            hint={t.completionZeroExcludedHint}
          />
          {session.failed_statements.map((failed) => (
            <ReceiptLine
              key={failed.id}
              label={t.completionFailedStatement.replace(
                "{filename}",
                failed.filename || failed.product_id,
              )}
              value="—"
            />
          ))}
          <ReceiptLine
            label={t.completionImportedNew}
            value={String(session.imported_new_count)}
          />
          <ReceiptLine
            label={t.completionSkippedDuplicate}
            value={String(session.skipped_duplicate_count)}
          />
        </ul>
      </div>
    </section>
  );
}
