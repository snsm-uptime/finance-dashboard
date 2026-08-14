import type { ReactNode } from "react";

type SectionLabelProps = {
  children: ReactNode;
};

export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <h2
      className="m-0 pt-[var(--space-2)] px-[var(--space-1)] pb-[var(--space-1)] uppercase text-muted"
      style={{
        fontFamily: "var(--type-section-label-face)",
        fontSize: "var(--type-section-label-size)",
        fontWeight: "var(--type-section-label-weight)",
        letterSpacing: "var(--type-section-label-tracking)",
      }}
    >
      {children}
    </h2>
  );
}
