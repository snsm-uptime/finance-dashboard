import styles from "./IncompleteDisclosure.module.css";

type ResolveAction =
  | { onResolve: () => void; resolveLabel: string }
  | { onResolve?: undefined; resolveLabel?: undefined };

export type IncompleteDisclosureProps = {
  /** Renders the disclosure only when true (AC #1) — no fabricated incomplete state. */
  isIncomplete?: boolean;
  label: string;
} & ResolveAction;

// TODO (Epic 5.2-5.4): Wire real incomplete data from API.
// - API response will add balanceStatus.isIncomplete (bool) to the balances payload.
// - When incomplete, balanceStatus.unresolvedQuarantineCount / unresolvedConflictCount arrive too.
// - onResolve will route to the quarantine/conflict resolution detail view.
// - This story creates the slot only; Epic 5 supplies the real data and behavior.
export function IncompleteDisclosure({
  isIncomplete,
  label,
  onResolve,
  resolveLabel,
}: IncompleteDisclosureProps) {
  if (!isIncomplete) return null;

  return (
    <div className={styles.disclosure} role="status">
      {label}
      {onResolve ? (
        <button type="button" className={styles.resolve} onClick={onResolve}>
          {resolveLabel}
        </button>
      ) : null}
    </div>
  );
}
