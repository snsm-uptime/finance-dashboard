import type { SVGProps } from "react";

export function CreditCardIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M3 10H21" stroke="currentColor" strokeWidth="2" />
      <path d="M6 15H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
