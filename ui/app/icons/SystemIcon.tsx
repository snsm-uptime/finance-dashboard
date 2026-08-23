import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function SystemIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="11.5"
        rx="1.75"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
      />
      <path
        d="M8 20h8M12 16.5V20"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
