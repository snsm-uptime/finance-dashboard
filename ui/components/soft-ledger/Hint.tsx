import type { ReactNode } from "react";

type HintProps = {
  children: ReactNode;
};

export function Hint({ children }: HintProps) {
  return (
    <p
      className="m-0 mx-strip-inset pt-[var(--space-2)] px-[var(--space-1)] pb-[var(--space-1)] text-muted"
      style={{
        fontFamily: "var(--type-meta-face)",
        fontSize: "var(--type-meta-size)",
        fontWeight: "var(--type-meta-weight)",
      }}
    >
      {children}
    </p>
  );
}
