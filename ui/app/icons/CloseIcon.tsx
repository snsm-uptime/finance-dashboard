import type { SVGProps } from "react";

export function CloseIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      width="17.6"
      height="17.6"
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M6.5 6.5l11 11M17.5 6.5l-11 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
