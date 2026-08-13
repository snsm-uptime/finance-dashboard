import type { ReactNode } from "react";

export type BalancePolarity = "owe" | "owed" | "neutral";

type BalanceStripProps = {
  who: string;
  amount: string;
  polarity?: BalancePolarity;
  /** Optional CTA slot — omit on empty / J2 balances-only surfaces. */
  action?: ReactNode;
};

export function BalanceStrip({
  who,
  amount,
  polarity = "neutral",
  action,
}: BalanceStripProps) {
  const amountColorClass =
    polarity === "owe"
      ? "text-owe"
      : polarity === "owed"
        ? "text-owed"
        : "text-muted";

  return (
    <section
      className="grid grid-cols-[1fr_auto] items-center gap-[var(--space-4)] mx-strip-inset px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
      aria-label={who}
    >
      <div className="min-w-0">
        <p
          className="m-0 text-muted"
          style={{
            fontFamily: "var(--type-strip-who-face)",
            fontSize: "var(--type-strip-who-size)",
            fontWeight: "var(--type-strip-who-weight)",
            letterSpacing: "var(--type-strip-who-tracking)",
            lineHeight: "var(--type-strip-who-lh)",
          }}
        >
          {who}
        </p>
        <p
          className={`m-0 tabular-nums ${amountColorClass}`}
          style={{
            fontFamily: "var(--type-strip-amount-face)",
            fontSize: "var(--type-strip-amount-size)",
            fontWeight: "var(--type-strip-amount-weight)",
            letterSpacing: "var(--type-strip-amount-tracking)",
            lineHeight: "var(--type-strip-amount-lh)",
          }}
        >
          {amount}
        </p>
      </div>
      {action ? <div className="flex items-center">{action}</div> : null}
    </section>
  );
}
