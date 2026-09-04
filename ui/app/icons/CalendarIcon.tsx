import type { SVGProps } from "react";

export function CalendarIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <rect x="4" y="5.5" width="16" height="15" rx="2.4" stroke="currentColor" strokeWidth="2.1" />
      <path d="M8 3.5v4M16 3.5v4M4.5 10h15" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}
