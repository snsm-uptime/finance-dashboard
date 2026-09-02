import type { SVGProps } from "react";

export function PencilIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
