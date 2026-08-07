import type { ReactNode } from "react";

import styles from "./BalanceStrip.module.css";

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
  const amountClass =
    polarity === "owe"
      ? styles.amountOwe
      : polarity === "owed"
        ? styles.amountOwed
        : styles.amountNeutral;

  return (
    <section className={styles.strip} aria-label={who}>
      <div className={styles.copy}>
        <p className={styles.who}>{who}</p>
        <p className={`${styles.amount} ${amountClass}`}>{amount}</p>
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}
