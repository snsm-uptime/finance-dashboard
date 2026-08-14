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
    <div
      className="m-0 mx-strip-inset px-[var(--space-4)] py-[var(--space-5)] bg-transparent text-muted"
      style={{
        fontFamily: "var(--type-meta-face)",
        fontSize: "var(--type-meta-size)",
        fontWeight: "var(--type-meta-weight)",
        lineHeight: "1.4",
      }}
      role="status"
    >
      {label}
      {onResolve ? (
        <button
          type="button"
          className="inline ml-[var(--space-1)] p-0 border-none bg-transparent underline cursor-pointer text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ font: "inherit" }}
          onClick={onResolve}
        >
          {resolveLabel}
        </button>
      ) : null}
    </div>
  );
}
