import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function PercentageIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <circle
        cx="7.25"
        cy="7.25"
        r="2.75"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
      />
      <circle
        cx="16.75"
        cy="16.75"
        r="2.75"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
      />
      <path
        d="M16.5 6.5 7.5 17.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
