import { Chip } from "@/components/Chip";

import { ReceiptRowMenu, type ReceiptRowMenuMessages } from "./ReceiptRowMenu";

export type ReceiptRowProps = {
  title?: string;
  when?: string;
  amount?: string;
  originChip?: string;
  shareLabel?: string;
  netLabel?: string;
  netPolarity?: "owe" | "owed";
  menu?: ReceiptRowMenuMessages;
  /** Empty settle surface — muted placeholder, no invented totals. */
  emptyLabel?: string;
  /** FX audit detail (Story 3.5 AC #3) — rate/date, keyboard-accessible via <details>. */
  fxSummary?: string;
  fxDetail?: string;
};

const bodyType = {
  fontFamily: "var(--type-body-face)",
  fontSize: "var(--type-body-size)",
  fontWeight: "var(--type-body-weight)",
  lineHeight: "var(--type-body-lh)",
} as const;

const metaType = {
  fontFamily: "var(--type-meta-face)",
  fontSize: "var(--type-meta-size)",
  fontWeight: "var(--type-meta-weight)",
} as const;

const amountType = {
  fontFamily: "var(--type-amount-inline-face)",
  fontSize: "var(--type-amount-inline-size)",
  fontWeight: "var(--type-amount-inline-weight)",
} as const;

export function ReceiptRow({
  title,
  when,
  amount,
  originChip,
  shareLabel,
  netLabel,
  netPolarity,
  menu,
  emptyLabel,
  fxSummary,
  fxDetail,
}: ReceiptRowProps) {
  if (emptyLabel && !title) {
    return (
      <div
        className="grid grid-cols-1 gap-y-[var(--space-2)] gap-x-[var(--space-4)] py-[var(--row-y)] px-[var(--space-1)] border-b border-border"
        role="status"
      >
        <span style={metaType} className="text-muted">
          {emptyLabel}
        </span>
      </div>
    );
  }

  const netClass =
    netPolarity === "owe" ? "text-owe" : netPolarity === "owed" ? "text-owed" : "text-muted";

  return (
    <div className="flex items-center gap-x-[var(--space-4)] py-[var(--row-y)] px-[var(--space-1)] border-b border-border">
      <div className="box-border h-10 w-10 p-2 shrink-0" aria-hidden="true">
        <div className="h-full w-full rounded-[6px] border border-border" />
      </div>
      <div className="min-w-0 flex-1 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[var(--space-4)] gap-y-[2px]">
        <div className="flex items-center gap-2 min-w-0">
          <span style={bodyType} className="text-foreground truncate">
            {title}
          </span>
          {originChip ? <Chip>{originChip}</Chip> : null}
        </div>
        {amount ? (
          <span style={amountType} className="tabular-nums text-muted text-right">
            {amount}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center justify-between gap-2 min-w-0">
          {when ? (
            <span style={metaType} className="text-muted">
              {when}
            </span>
          ) : (
            <span />
          )}
          {shareLabel ? (
            <span style={metaType} className="text-accent tabular-nums">
              {shareLabel}
            </span>
          ) : null}
        </div>
        {netLabel ? (
          <span style={amountType} className={`tabular-nums text-right ${netClass}`}>
            {netLabel}
          </span>
        ) : (
          <span />
        )}
        {fxSummary && fxDetail ? (
          <details className="col-span-2 text-muted">
            <summary style={{ ...metaType, cursor: "pointer" }} aria-label={fxDetail}>
              {fxSummary}
            </summary>
            <p style={metaType}>{fxDetail}</p>
          </details>
        ) : null}
      </div>
      {menu ? <ReceiptRowMenu messages={menu} /> : null}
    </div>
  );
}
