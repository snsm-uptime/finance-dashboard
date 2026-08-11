import type { SVGProps } from "react";

export function ShareIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        d="M8.59 13.51L15.41 17.49"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.41 6.51L8.59 10.49"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
