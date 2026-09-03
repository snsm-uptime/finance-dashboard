import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function HelpIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      width="17.6"
      height="17.6"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
      />
      <path
        d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.25c-.7.36-1.1.98-1.1 1.75V14"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
