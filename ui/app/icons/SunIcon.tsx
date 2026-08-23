import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

export function SunIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        cx="12"
        cy="12"
        r="3.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
      />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
    </svg>
  );
}
