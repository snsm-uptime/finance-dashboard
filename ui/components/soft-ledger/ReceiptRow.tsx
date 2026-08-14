type ReceiptRowProps = {
  title?: string;
  when?: string;
  amount?: string;
  /** Empty settle surface — muted placeholder, no invented totals. */
  emptyLabel?: string;
  /** FX audit detail (Story 3.5 AC #3) — rate/date, keyboard-accessible via <details>. */
  fxSummary?: string;
  fxDetail?: string;
};

export function ReceiptRow({ title, when, amount, emptyLabel, fxSummary, fxDetail }: ReceiptRowProps) {
  if (emptyLabel && !title) {
    return (
      <div
        className="grid grid-cols-1 gap-y-[var(--space-2)] gap-x-[var(--space-4)] py-[var(--row-y)] px-[var(--space-1)] border-b border-border"
        role="status"
      >
        <span
          style={{
            fontFamily: "var(--type-meta-face)",
            fontSize: "var(--type-meta-size)",
            fontWeight: "var(--type-meta-weight)",
          }}
          className="text-muted"
        >
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-y-[var(--space-2)] gap-x-[var(--space-4)] py-[var(--row-y)] px-[var(--space-1)] border-b border-border">
      <div className="flex flex-col gap-[2px] min-w-0">
        <span
          style={{
            fontFamily: "var(--type-body-face)",
            fontSize: "var(--type-body-size)",
            fontWeight: "var(--type-body-weight)",
            lineHeight: "var(--type-body-lh)",
          }}
          className="text-foreground"
        >
          {title}
        </span>
        {when ? (
          <span
            style={{
              fontFamily: "var(--type-meta-face)",
              fontSize: "var(--type-meta-size)",
              fontWeight: "var(--type-meta-weight)",
            }}
            className="text-muted"
          >
            {when}
          </span>
        ) : null}
        {fxSummary && fxDetail ? (
          <details className="text-muted">
            <summary
              style={{
                fontFamily: "var(--type-meta-face)",
                fontSize: "var(--type-meta-size)",
                fontWeight: "var(--type-meta-weight)",
                cursor: "pointer",
              }}
              aria-label={fxDetail}
            >
              {fxSummary}
            </summary>
            <p
              style={{
                fontFamily: "var(--type-meta-face)",
                fontSize: "var(--type-meta-size)",
                fontWeight: "var(--type-meta-weight)",
              }}
            >
              {fxDetail}
            </p>
          </details>
        ) : null}
      </div>
      {amount ? (
        <span
          style={{
            fontFamily: "var(--type-amount-inline-face)",
            fontSize: "var(--type-amount-inline-size)",
            fontWeight: "var(--type-amount-inline-weight)",
          }}
          className="tabular-nums text-muted self-center"
        >
          {amount}
        </span>
      ) : null}
    </div>
  );
}
