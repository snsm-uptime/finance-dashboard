import type { ReactNode } from "react";

export type ChipProps = {
  children: ReactNode;
  /** Accent border for named values; muted for generic tags. */
  tone?: "accent" | "muted";
};

const mutedClass =
  "inline-flex flex-shrink-0 items-center m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-border text-muted bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-none";
const accentClass =
  "inline-flex flex-shrink-0 items-center m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-accent text-accent bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-none";

/** Display-only chip — same visual as the card-routing chip, not a toggle. */
export function Chip({ children, tone = "muted" }: ChipProps) {
  return <span className={tone === "accent" ? accentClass : mutedClass}>{children}</span>;
}
