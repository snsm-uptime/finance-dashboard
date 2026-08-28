import type { SVGProps } from "react";

/** Chevron pointing left — chrome back control, not the long-shaft ArrowIcon. */
export function BackIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      width="17.6"
      height="17.6"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
