"use client";

import type { ReactNode } from "react";

import { chipClassName, type ChipTone } from "@/components/Chip";
import { SlideDown } from "@/components/SlideDown";

const focusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

export type ChipOption = {
  value: string;
  label: ReactNode;
  ariaLabel?: string;
  tone?: ChipTone;
};

export type ChipOptionsPanelProps = {
  open: boolean;
  id: string;
  labelledBy: string;
  options: ChipOption[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  error?: ReactNode;
  /** Overrides the default row styling (rounded box) — e.g. CardRoutingControl's plain divider row. */
  contentClassName?: string;
};

const defaultContentClassName = "mt-1 flex flex-wrap items-center gap-2 rounded-[8px] p-2";

/** The chip row that slides down beneath a `ChipTrigger` — one chip per selectable option. */
export function ChipOptionsPanel({
  open,
  id,
  labelledBy,
  options,
  onSelect,
  disabled = false,
  error,
  contentClassName,
}: ChipOptionsPanelProps) {
  return (
    <SlideDown open={open} id={id} labelledBy={labelledBy}>
      <div className={contentClassName ?? defaultContentClassName}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-label={option.ariaLabel ?? (typeof option.label === "string" ? option.label : undefined)}
            onClick={() => onSelect(option.value)}
            className={`${chipClassName[option.tone ?? "muted"]} ${focusRing} ${
              option.tone === "warning" ? "hover:bg-owe/10" : "hover:border-muted"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {option.label}
          </button>
        ))}
        <div aria-live="polite">
          {error ? (
            <p className="m-0 w-full text-[0.85rem] text-owe" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </SlideDown>
  );
}
