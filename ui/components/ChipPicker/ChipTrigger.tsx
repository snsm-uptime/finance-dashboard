"use client";

import { forwardRef, type ReactNode } from "react";

import { chipClassName, type ChipTone } from "@/components/Chip";

const focusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export function chipTriggerClassName(tone: ChipTone): string {
  const hover = tone === "warning" ? "hover:bg-owe/10" : "hover:border-muted";
  return `${chipClassName[tone]} ${focusRing} ${hover}`;
}

export type ChipTriggerProps = {
  id: string;
  panelId: string;
  open: boolean;
  tone?: ChipTone;
  ariaLabel: string;
  title?: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
};

/** Chip button that opens/closes a `ChipOptionsPanel` — the same trigger look across every chip picker. */
export const ChipTrigger = forwardRef<HTMLButtonElement, ChipTriggerProps>(function ChipTrigger(
  { id, panelId, open, tone = "muted", ariaLabel, title, onClick, children, className },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      id={id}
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-controls={panelId}
      title={title ?? ariaLabel}
      onClick={onClick}
      className={className ? `${chipTriggerClassName(tone)} ${className}` : chipTriggerClassName(tone)}
    >
      {children}
      <span
        aria-hidden="true"
        className={`ml-1 inline-block w-[0.32rem] h-[0.32rem] border-r-[1.5px] border-b-[1.5px] border-current opacity-70 transition-transform duration-200 motion-reduce:transition-none ${
          open ? "rotate-[225deg] translate-y-px" : "rotate-45 -translate-y-px"
        }`}
      />
    </button>
  );
});
