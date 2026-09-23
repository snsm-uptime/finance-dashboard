import styles from "../lists.module.scss";

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

export default function ListDetailLoading() {
  return (
    <main
      className={styles.softMain}
      role="status"
      aria-live="polite"
      aria-label="Loading list"
    >
      <div className={styles.softBody}>
        <div className={styles.detailLayout}>
          <div className={styles.detailPrimary}>
            <section className="flex flex-col gap-[var(--space-4)] mx-strip-inset px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md">
              <div className="min-w-0 flex flex-col gap-[var(--space-2)]">
                <Pulse className="h-4 w-32" />
                <Pulse className="h-6 w-24" />
              </div>
            </section>
            <div className={styles.softReceipts}>
              <div className={styles.softReceiptsChrome}>
                <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
                  <Pulse className="h-4 w-28" />
                  <Pulse className="h-8 w-32" />
                </div>
              </div>
              <div className={styles.softReceiptsList}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="py-[var(--row-y)] px-[var(--space-1)] border-b border-border flex items-center gap-[var(--space-4)]"
                  >
                    <Pulse className="h-10 w-10 shrink-0 rounded-[6px]" />
                    <div className="flex min-w-0 flex-1 flex-col gap-[var(--space-2)]">
                      <Pulse className="h-4 w-3/5" />
                      <Pulse className="h-3 w-2/5" />
                    </div>
                    <Pulse className="h-4 w-16 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <aside className={styles.detailSidebar}>
            <div className="flex w-fit items-center gap-px overflow-hidden border border-border rounded-lg bg-surface">
              <Pulse className="h-11 w-11" />
              <Pulse className="h-11 w-11" />
            </div>
            <div className="flex flex-col gap-[0.85rem] w-full">
              <div className="flex flex-col gap-[0.35rem]">
                <Pulse className="h-3.5 w-24" />
                <Pulse className="h-9 w-full rounded-[var(--rounded-sm)]" />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <Pulse className="h-3.5 w-32" />
                <Pulse className="h-9 w-full rounded-[var(--rounded-sm)]" />
              </div>
              <div className="flex flex-col gap-[0.35rem]">
                <Pulse className="h-3.5 w-28" />
                <Pulse className="h-9 w-2/3 rounded-[var(--rounded-sm)]" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
