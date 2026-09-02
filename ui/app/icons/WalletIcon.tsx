import type { SVGProps } from "react";

export function WalletIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        d="M3 7.5a2 2 0 0 1 2-2h11.5a2 2 0 0 1 2 2v1.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.3a2 2 0 0 0-2-2H6.5A3.5 3.5 0 0 1 3 7.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16.6" cy="14.5" r="1.1" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
