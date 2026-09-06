import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

type Props = SVGProps<SVGSVGElement> & {
  /** Closed box (false) vs open box (true) — drives a CSS lid-rotation morph. */
  active?: boolean;
};

/**
 * Closed/open storage-box glyph used as the archived-view toggle (Story 7.6).
 * The lid rotates open around its back edge via a CSS `transform` on
 * `.box-icon-lid` (see globals.css) — `prefers-reduced-motion` disables the
 * transition there, so the lid still ends in the right state, just without
 * the animated travel.
 */
export function OpenBoxIcon({ active = false, className, ...props }: Props) {
  const stroke = {
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const strokeWidth = ICON_STROKE;
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
      <g transform="translate(12,12) scale(0.08)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* Box body: unchanged, walls stay put while the lid opens */}
        <polygon points="-104,-60 0,0 0,120 -104,60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <polygon points="104,-60 0,0 0,120 104,60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />

        {/* Back flap: upper half of the original top rhombus, translated up-right */}
        <polygon points="39,-142.5 143,-82.5 91,-52.5 -13,-112.5" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />

        {/* Front flap: lower half of the original top rhombus, translated down-left */}
        <polygon points="-91,-67.5 -143,-37.5 -39,22.5 13,-7.5" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
