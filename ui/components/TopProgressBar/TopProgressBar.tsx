"use client";

import { Tooltip } from "@/components/Tooltip";

type Props = {
  /** 0-100+, or `null` when there's nothing to compute a ratio from. Fill width clamps to 100. */
  ratio: number | null;
  /** Severity class supplied by the caller (e.g. `bg-owed`/`bg-warn`/`bg-owe`/`bg-muted`) — this component stays severity-agnostic. */
  colorClassName: string;
  /** Pre-formatted tooltip text (e.g. `"$45.00 / $100.00"`) — this component does not know about money/currency formatting. */
  tooltipLabel: string;
  /** Accessible name for the bar itself, independent of the tooltip. */
  ariaLabel: string;
};

/** Generic, reusable thin progress bar (e.g. for budgets, import/export progress) — not hardcoded to any one domain. */
export function TopProgressBar({
  ratio,
  colorClassName,
  tooltipLabel,
  ariaLabel,
}: Props) {
  const clamped = ratio === null ? 0 : Math.min(ratio, 100);
  const fillColorClassName = ratio === null ? "bg-muted" : colorClassName;

  return (
    <Tooltip label={tooltipLabel}>
      <div
        tabIndex={0}
        role="progressbar"
        aria-label={ariaLabel}
        {...(ratio === null
          ? {}
          : {
              "aria-valuenow": clamped,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
            })}
        className="relative h-[3px] w-full bg-border"
      >
        <div
          className={`absolute inset-y-0 left-0 h-full transition-[width] ${fillColorClassName}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </Tooltip>
  );
}
