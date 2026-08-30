import type { SVGProps } from "react";

// Points right by default — rotate 90deg for down, 180deg for left.
export function TriangleIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8 5L19 12L8 19Z" fill="currentColor" />
    </svg>
  );
}
