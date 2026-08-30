import type { ReactNode } from "react";

import { Disclosure } from "@/components/Disclosure";

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

type MemberDetailRow = PairwiseRow & { polarity: "owe" | "owed" };

/** "You are owed" rows first, then "You owe" rows — same order the old two columns read left-to-right. */
function memberDetailRowsFrom(youAreOwed: PairwiseRow[], youOwe: PairwiseRow[]): MemberDetailRow[] {
  return [
    ...youAreOwed.map((row) => ({ ...row, polarity: "owed" as const })),
    ...youOwe.map((row) => ({ ...row, polarity: "owe" as const })),
  ];
}

function MemberDetailsList({
  rows,
  owesYouLabel,
  isOwedLabel,
}: {
  rows: MemberDetailRow[];
  owesYouLabel: string;
  isOwedLabel: string;
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
      {rows.map((row) => (
        <li
          key={row.memberId}
          className="flex items-baseline justify-between gap-[var(--space-2)] py-[var(--space-2)] first:pt-0 last:pb-0"
        >
          <span className="min-w-0 truncate" style={{ fontFamily: "var(--type-meta-face)" }}>
            {row.label} {row.polarity === "owed" ? owesYouLabel : isOwedLabel}
          </span>
          <span className={`tabular-nums ${toneClass(row.polarity)}`} style={amountStyle}>
            {row.amount}
          </span>
        </li>
      ))}
    </ul>
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
  memberDetailsTitle: string;
  owesYouLabel: string;
  isOwedLabel: string;
  balanceLabel: string;
  youAreOwed: PairwiseRow[];
  youOwe: PairwiseRow[];
  balanceAmount: string;
  balancePolarity?: BalancePolarity;
  action?: ReactNode;
  /** Group-transfer plan section, own disclosure — 3+ member lists only (Story 5.8). */
  simplify?: ReactNode;
  /** Full-width settle CTA row at the bottom of the strip (Story 5.8). */
  settleAction?: ReactNode;
};

type BalanceStripProps = BalanceStripMessageProps | BalanceStripGridProps;

/**
 * Soft-Ledger settle read. "message" is the empty/error/no-expenses single-line
 * strip (unchanged since Story 3.3); "grid" is the pairwise read: Balance up
 * top, then collapsible "Member details" and "Group transfer plan" sections
 * stacked below (Story 5.8 restyle) — collapsible content doesn't fit a fixed
 * grid column, so this variant is a vertical stack rather than a grid.
 */
export function BalanceStrip(props: BalanceStripProps) {
  if (props.variant === "grid") {
    const {
      memberDetailsTitle,
      owesYouLabel,
      isOwedLabel,
      balanceLabel,
      youAreOwed,
      youOwe,
      balanceAmount,
      action,
      simplify,
      settleAction,
    } = props;
    const balancePolarity = props.balancePolarity ?? "neutral";
    const memberRows = memberDetailRowsFrom(youAreOwed, youOwe);
    return (
      <section
        className="flex flex-col gap-[var(--space-4)] mx-strip-inset px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
        aria-label={balanceLabel}
      >
        <div className="flex items-start justify-between gap-[var(--space-4)]">
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
        </div>
        {memberRows.length > 0 ? (
          <Disclosure title={memberDetailsTitle} defaultOpen>
            <MemberDetailsList rows={memberRows} owesYouLabel={owesYouLabel} isOwedLabel={isOwedLabel} />
          </Disclosure>
        ) : null}
        {simplify}
        {settleAction}
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
