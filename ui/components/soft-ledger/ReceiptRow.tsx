import styles from "./ReceiptRow.module.css";

type ReceiptRowProps = {
  title?: string;
  when?: string;
  amount?: string;
  /** Empty settle surface — muted placeholder, no invented totals. */
  emptyLabel?: string;
};

export function ReceiptRow({ title, when, amount, emptyLabel }: ReceiptRowProps) {
  if (emptyLabel && !title) {
    return (
      <div className={`${styles.row} ${styles.empty}`} role="status">
        <span className={styles.emptyLabel}>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className={styles.row}>
      <div className={styles.metaCol}>
        <span className={styles.title}>{title}</span>
        {when ? <span className={styles.when}>{when}</span> : null}
      </div>
      {amount ? (
        <span className={styles.amount}>{amount}</span>
      ) : null}
    </div>
  );
}
