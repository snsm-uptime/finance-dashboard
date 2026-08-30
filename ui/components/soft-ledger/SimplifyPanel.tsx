import { CopyButton } from "@/components/CopyButton/CopyButton";

export type SimplifyTransfer = {
  fromMemberId: string;
  fromLabel: string;
  toMemberId: string;
  toLabel: string;
  amountCrc: string;
};

export type SimplifyPanelMessages = {
  title: string;
  emptyLabel: string;
  copyLabel: string;
  copiedLabel: string;
};

/**
 * Plain-text group plan for outside-the-app sharing (AC #4, UX-DR17). Never
 * says "paid" and never looks like a settlement record — names, CRC, and
 * direction only.
 */
export function simplifyPlanTextFrom(transfers: SimplifyTransfer[]): string {
  return transfers
    .map((t) => `${t.fromLabel} pays ${t.toLabel} ${t.amountCrc}`)
    .join("\n");
}

type Props = {
  transfers: SimplifyTransfer[];
  messages: SimplifyPanelMessages;
};

/** Presentational — literal `transfers` prop only, no fetching (Story 5.8). */
export function SimplifyPanel({ transfers, messages }: Props) {
  return (
    <div className="mx-strip-inset flex flex-col gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-4)] bg-surface border border-border rounded-md">
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <p className="m-0 text-foreground" style={{ fontFamily: "var(--type-body-face)", fontWeight: 550 }}>
          {messages.title}
        </p>
        {transfers.length > 0 ? (
          <CopyButton
            value={simplifyPlanTextFrom(transfers)}
            label={messages.copyLabel}
            copiedLabel={messages.copiedLabel}
          />
        ) : null}
      </div>
      {transfers.length === 0 ? (
        <p className="m-0 text-muted" style={{ fontFamily: "var(--type-meta-face)" }}>
          {messages.emptyLabel}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-[var(--space-2)] p-0">
          {transfers.map((t, index) => (
            <li
              key={`${t.fromMemberId}-${t.toMemberId}-${index}`}
              className="flex items-baseline justify-between gap-[var(--space-2)]"
            >
              <span className="min-w-0 truncate text-foreground" style={{ fontFamily: "var(--type-meta-face)" }}>
                {t.fromLabel} → {t.toLabel}
              </span>
              <span className="tabular-nums text-foreground" style={{ fontFamily: "var(--type-meta-face)" }}>
                {t.amountCrc}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
