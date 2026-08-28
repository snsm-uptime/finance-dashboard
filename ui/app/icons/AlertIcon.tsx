import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function AlertIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
      <path
        d="M12 9v5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
      <path
        d="M10.2 4.8 2.9 18a2 2 0 0 0 1.75 3h14.7A2 2 0 0 0 21.1 18L13.8 4.8a2 2 0 0 0-3.6 0Z"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinejoin="round"
      />
    </svg>
  );
}
