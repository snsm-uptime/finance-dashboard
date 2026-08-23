import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function HashtagIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        d="M10 4.5 8 19.5M16.5 4.5 14.5 19.5M4.5 9.25h15M4.5 14.75h15"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
