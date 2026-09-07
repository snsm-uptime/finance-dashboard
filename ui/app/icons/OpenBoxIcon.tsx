import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

type Props = SVGProps<SVGSVGElement> & {
  /** Closed box (false) vs open box (true) — drives a CSS lid-rotation morph. */
  active?: boolean;
};

/**
 * Open storage-box glyph used as the archived-view toggle (Story 7.6),
 * paired with the closed variant in `BoxIcon`.
 */
export function OpenBoxIcon({ active = false, className, ...props }: Props) {
  const stroke = {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const strokeWidth = ICON_STROKE - 0.5;
  return (
    <svg
      className={["box-icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-active={active || undefined}
      {...props}
    >
      <g transform="translate(12,14.5) scale(0.075)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Box body: same dimensions as BoxIcon */}
        <polygon points="-104,-60 0,0 0,120 -104,60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <polygon points="104,-60 0,0 0,120 104,60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />

        {/* Open flaps */}
        <polyline points="104,-60 0,-120 -85,-71" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <polyline points="104,-60 130,-127 26,-187 0,-120" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <polyline points="0,0 -26,-37 -130,-97 -104,-60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
