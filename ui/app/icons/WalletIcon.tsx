import { useId, type SVGProps } from "react";

export function WalletIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        <rect x="2" y="8.7" width="20" height="1.4" rx="0.7" fill="black" />
        <circle cx="16.6" cy="15.3" r="1.3" fill="black" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <rect
          x="2.5"
          y="5.6"
          width="17.5"
          height="4"
          rx="2"
          transform="rotate(-7 11.25 7.6)"
          fill="currentColor"
        />
        <rect x="2" y="8.5" width="20" height="13" rx="4.2" fill="currentColor" />
      </g>
    </svg>
  );
}
