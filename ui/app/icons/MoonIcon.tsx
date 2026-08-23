import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function MoonIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M16.4 14.6A6.2 6.2 0 0 1 9.4 7.6 6.4 6.4 0 1 0 16.4 14.6Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinejoin="round"
      />
    </svg>
  );
}
