import type { ReactNode } from "react";

export type ChipTone = "accent" | "muted" | "warning";

export type ChipProps = {
  children: ReactNode;
  /** Accent for named values; muted for generic tags; warning for missing origin. */
  tone?: ChipTone;
  /** Non-interactive disabled look (other members' origin chips). */
  disabled?: boolean;
};

export const chipClassName: Record<ChipTone, string> = {
  muted:
    "inline-flex flex-shrink-0 items-center m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-border text-muted bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-[1.15]",
  accent:
    "inline-flex flex-shrink-0 items-center m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-accent text-accent bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-[1.15]",
  warning:
    "inline-flex flex-shrink-0 items-center m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-owe text-owe bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-[1.15]",
};

/** Display-only chip — same visual as the card-routing chip, not a toggle. */
export function Chip({ children, tone = "muted", disabled = false }: ChipProps) {
  return (
    <span
      className={`${chipClassName[tone]}${disabled ? " opacity-55 cursor-default pointer-events-none" : ""}`}
      aria-disabled={disabled ? true : undefined}
    >
      {children}
    </span>
  );
}
