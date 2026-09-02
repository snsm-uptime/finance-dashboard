import type { SVGProps } from "react";

export function FolderIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        d="M3.5 6.5a1 1 0 0 1 1-1h5l1.8 2.2h9.2a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1V6.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
