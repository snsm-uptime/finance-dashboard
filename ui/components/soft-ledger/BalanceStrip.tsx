import type { ReactNode } from "react";

export type BalancePolarity = "owe" | "owed" | "neutral";

export type PairwiseRow = {
  memberId: string;
  label: string;
  amount: string;
};

const whoStyle = {
  fontFamily: "var(--type-strip-who-face)",
  fontSize: "var(--type-strip-who-size)",
  fontWeight: "var(--type-strip-who-weight)",
  letterSpacing: "var(--type-strip-who-tracking)",
  lineHeight: "var(--type-strip-who-lh)",
} as const;

const amountStyle = {
  fontFamily: "var(--type-strip-amount-face)",
  fontSize: "var(--type-strip-amount-size)",
  fontWeight: "var(--type-strip-amount-weight)",
  letterSpacing: "var(--type-strip-amount-tracking)",
  lineHeight: "var(--type-strip-amount-lh)",
} as const;

function toneClass(polarity: BalancePolarity): string {
  return polarity === "owe" ? "text-owe" : polarity === "owed" ? "text-owed" : "text-muted";
}

function BalanceColumn({
  label,
  rows,
  tone,
}: {
  label: string;
  rows: PairwiseRow[];
  tone: BalancePolarity;
}) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-muted" style={whoStyle}>
        {label}
      </p>
      {rows.length > 0 ? (
        <ul className="m-0 mt-[var(--space-1)] flex list-none flex-col gap-[var(--space-1)] p-0">
          {rows.map((row) => (
            <li
              key={row.memberId}
              className="flex items-baseline justify-between gap-[var(--space-2)]"
            >
              <span className="min-w-0 truncate text-muted" style={{ fontFamily: "var(--type-meta-face)" }}>
                {row.label}
              </span>
              <span className={`tabular-nums ${toneClass(tone)}`} style={amountStyle}>
                {row.amount}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type BalanceStripMessageProps = {
  variant?: "message";
  who: string;
  amount: string;
  polarity?: BalancePolarity;
  /** Optional CTA slot — omit on empty / J2 balances-only surfaces. */
  action?: ReactNode;
};

type BalanceStripGridProps = {
  variant: "grid";
  youAreOwedLabel: string;
  youOweLabel: string;
  balanceLabel: string;
  youAreOwed: PairwiseRow[];
  youOwe: PairwiseRow[];
  balanceAmount: string;
  balancePolarity?: BalancePolarity;
  action?: ReactNode;
};

type BalanceStripProps = BalanceStripMessageProps | BalanceStripGridProps;

/**
 * Soft-Ledger settle read. "message" is the empty/error/no-expenses single-line
 * strip (unchanged since Story 3.3); "grid" is the Story 5.8 three-column
 * pairwise read: You are owed | You owe | Balance.
 */
export function BalanceStrip(props: BalanceStripProps) {
  if (props.variant === "grid") {
    const { youAreOwedLabel, youOweLabel, balanceLabel, youAreOwed, youOwe, balanceAmount, action } =
      props;
    const balancePolarity = props.balancePolarity ?? "neutral";
    return (
      <section
        className="grid grid-cols-1 items-start gap-[var(--space-4)] mx-strip-inset px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md md:grid-cols-[1fr_1fr_1fr_auto]"
        aria-label={balanceLabel}
      >
        <BalanceColumn label={youAreOwedLabel} rows={youAreOwed} tone="owed" />
        <BalanceColumn label={youOweLabel} rows={youOwe} tone="owe" />
        <div className="min-w-0">
          <p className="m-0 text-muted" style={whoStyle}>
            {balanceLabel}
          </p>
          <p
            className={`m-0 tabular-nums ${toneClass(balancePolarity)}`}
            style={amountStyle}
          >
            {balanceAmount}
          </p>
        </div>
        {action}
      </section>
    );
  }

  const { who, amount, polarity = "neutral", action } = props;
  return (
    <section
      className="grid grid-cols-[1fr_auto] items-center gap-[var(--space-4)] mx-strip-inset px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
      aria-label={who}
    >
      <div className="min-w-0">
        <p className="m-0 text-muted" style={whoStyle}>
          {who}
        </p>
        <p className={`m-0 tabular-nums ${toneClass(polarity)}`} style={amountStyle}>
          {amount}
        </p>
      </div>
      {action}
    </section>
  );
}
