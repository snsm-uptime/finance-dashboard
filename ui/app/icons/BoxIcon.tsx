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
export function BoxIcon({ active = false, className, ...props }: Props) {
  const stroke = {
    stroke: "currentColor",
    strokeWidth: ICON_STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

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
      <path d="M4 10.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5Z" {...stroke} />
      <path
        className="box-icon-lid"
        d="M3.5 8a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2.5h-17V8Z"
        {...stroke}
        style={{
          transformOrigin: "3.5px 8px",
          transform: active ? "rotate(-28deg) translate(0.5px, -1.5px)" : "none",
        }}
      />
    </svg>
  );
}
