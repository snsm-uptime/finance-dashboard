import { useId, type SVGProps } from "react";

export function UsersIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const maskId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="white" />
        <path d="M3.8 23a8.2 8.2 0 0 1 16.4 0Z" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path d="M0 23a5.4 5.4 0 0 1 10.8 0Z" fill="currentColor" />
        <path d="M13.2 23a5.4 5.4 0 0 1 10.8 0Z" fill="currentColor" />
      </g>
      <circle cx="5" cy="8.6" r="2.6" fill="currentColor" />
      <circle cx="19" cy="8.6" r="2.6" fill="currentColor" />
      <path d="M4.7 23a7.3 7.3 0 0 1 14.6 0Z" fill="currentColor" />
      <circle cx="12" cy="6.5" r="4.2" fill="currentColor" />
    </svg>
  );
}
