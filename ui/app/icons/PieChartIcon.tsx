import type { SVGProps } from "react";

export function PieChartIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M 12 2 A 10 10 0 0 1 20.66 6.34 L 12 12 Z" fill="currentColor" />
    </svg>
  );
}
