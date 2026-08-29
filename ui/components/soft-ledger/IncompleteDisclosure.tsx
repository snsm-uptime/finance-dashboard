import Link from "next/link";

type ResolveAction =
  | { resolveHref: string; resolveLabel: string }
  | { resolveHref?: undefined; resolveLabel?: undefined };

export type IncompleteDisclosureProps = {
  /** Renders the disclosure only when true (AC #1) — no fabricated incomplete state. */
  isIncomplete?: boolean;
  label: string;
} & ResolveAction;

export function IncompleteDisclosure({
  isIncomplete,
  label,
  resolveHref,
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
      {resolveHref ? (
        <Link
          href={resolveHref}
          className="inline ml-[var(--space-1)] underline cursor-pointer text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ font: "inherit" }}
        >
          {resolveLabel}
        </Link>
      ) : null}
    </div>
  );
}
