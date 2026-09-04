import type { ReactNode } from "react";

export type ChipTone = "accent" | "muted" | "warning";

export type ChipProps = {
  children: ReactNode;
  /** Accent for named values; muted for generic tags; warning for missing origin. Ignored if `className` is set. */
  tone?: ChipTone;
  /** Overrides the tone's border/text color classes (e.g. a per-state color the fixed tones don't cover). */
  className?: string;
  /** Non-interactive disabled look (other members' origin chips). */
  disabled?: boolean;
};

/** Shape/layout only — no border or text color. Compose with a tone's color classes or a custom override. */
export const chipBaseClassName =
  "inline-flex flex-shrink-0 items-center m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-[1.15]";

const chipToneColorClassName: Record<ChipTone, string> = {
  muted: "border-border text-muted",
  accent: "border-accent text-accent",
  warning: "border-owe text-owe",
};

/** Full chip classes (shape + tone color), for callers building their own chip-styled elements. */
export const chipClassName: Record<ChipTone, string> = {
  muted: `${chipBaseClassName} ${chipToneColorClassName.muted}`,
  accent: `${chipBaseClassName} ${chipToneColorClassName.accent}`,
  warning: `${chipBaseClassName} ${chipToneColorClassName.warning}`,
};

/** Display-only chip — same visual as the card-routing chip, not a toggle. */
export function Chip({ children, tone = "muted", className, disabled = false }: ChipProps) {
  return (
    <span
      className={`${chipBaseClassName} ${className ?? chipToneColorClassName[tone]}${disabled ? " opacity-55 cursor-default pointer-events-none" : ""}`}
      aria-disabled={disabled ? true : undefined}
    >
      {children}
    </span>
  );
}
