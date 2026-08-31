import { SectionLabel } from "./SectionLabel";

export type OriginCardItem = {
  kind: "card" | "cash" | "blank";
  label: string;
  amountCrc: string;
  /** True when this origin's period spend netted below zero (a reversal outside the period offsetting a purchase inside it). */
  isNegative?: boolean;
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

type Props = {
  origins: OriginCardItem[];
  emptyLabel: string;
  sectionLabel: string;
};

/**
 * Solo-list hero (Story 6.2, FR-47) — one island per origin with this
 * period's spend. Renders every origin present, including a single card
 * (unlike CyclePeriodSelector, which suppresses 0/1-item lists).
 */
export function OriginCards({ origins, emptyLabel, sectionLabel }: Props) {
  return (
    <section className="flex flex-col gap-[var(--space-3)] mx-strip-inset">
      <SectionLabel>{sectionLabel}</SectionLabel>
      {origins.length === 0 ? (
        <div
          className="px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
          role="status"
        >
          <p className="m-0 text-muted" style={whoStyle}>
            {emptyLabel}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-[var(--space-3)]">
          {origins.map((origin, index) => (
            <div
              key={`${origin.kind}-${index}`}
              className="min-w-0 flex-1 px-[var(--space-4)] py-[var(--space-5)] bg-surface border border-border rounded-md"
            >
              <p className="m-0 truncate text-muted" style={whoStyle}>
                {origin.label}
              </p>
              <p
                className={`m-0 tabular-nums ${origin.isNegative ? "text-owe" : ""}`}
                style={amountStyle}
              >
                {origin.amountCrc}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
