"use client";

import { Tooltip } from "@/components/Tooltip";

type CommonProps = {
  /** 0-100+, or `null` when there's nothing to compute a ratio from. Fill width clamps to 100. */
  ratio: number | null;
  /** Severity class supplied by the caller (e.g. `bg-owed`/`bg-warn`/`bg-owe`/`bg-muted`) — this component stays severity-agnostic. */
  colorClassName: string;
  /** Accessible name for the bar itself, independent of the tooltip/labels. */
  ariaLabel: string;
};

type ThinProps = CommonProps & {
  variant?: "thin";
  /** Pre-formatted tooltip text (e.g. `"$45.00 / $100.00"`) — this component does not know about money/currency formatting. */
  tooltipLabel: string;
};

type ThickProps = CommonProps & {
  variant: "thick";
  /** Left-aligned value shown embedded in the bar (e.g. spent amount). */
  startLabel: string;
  /** Right-aligned value shown embedded in the bar (e.g. cap amount). */
  endLabel: string;
};

type Props = ThinProps | ThickProps;

const barLabelClassName =
  "absolute inset-0 flex items-center justify-between px-[10px] text-[0.72rem] font-[550] tabular-nums pointer-events-none whitespace-nowrap";

/**
 * Generic, reusable progress bar (e.g. for budgets, import/export progress)
 * — not hardcoded to any one domain. Two variants:
 *  - "thin" (default): a slim line, values revealed via hover/focus tooltip.
 *  - "thick": a full-height bar with start/end values always visible,
 *    painted twice (once in --foreground for the track, once in
 *    --on-accent clipped to the fill) so whichever copy sits under the
 *    fill edge always has readable contrast — no fixed color choice can
 *    fail against both the track and every severity fill color.
 */
export function TopProgressBar(props: Props) {
  const { ratio, colorClassName, ariaLabel } = props;
  const clamped = ratio === null ? 0 : Math.min(ratio, 100);
  const fillColorClassName = ratio === null ? "bg-muted" : colorClassName;
  const progressAttrs =
    ratio === null
      ? {}
      : {
          "aria-valuenow": clamped,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
        };

  if (props.variant === "thick") {
    return (
      <div
        role="progressbar"
        aria-label={ariaLabel}
        {...progressAttrs}
        className="relative h-[30px] w-full overflow-hidden bg-border"
      >
        <div
          className={`absolute inset-y-0 left-0 h-full transition-[width] ${fillColorClassName}`}
          style={{ width: `${clamped}%` }}
        />
        <div className={`${barLabelClassName} text-foreground`}>
          <span>{props.startLabel}</span>
          <span>{props.endLabel}</span>
        </div>
        <div
          className={`${barLabelClassName} text-on-accent`}
          style={{ clipPath: `inset(0 ${100 - clamped}% 0 0)` }}
        >
          <span>{props.startLabel}</span>
          <span>{props.endLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <Tooltip label={props.tooltipLabel}>
      <div
        tabIndex={0}
        role="progressbar"
        aria-label={ariaLabel}
        {...progressAttrs}
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
