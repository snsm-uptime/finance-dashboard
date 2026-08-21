import type { SVGProps } from "react";

import { ICON_STROKE } from "./stroke";

/**
 * File glyph with an inbound arrow. Same document + fold as FileIcon; the
 * left edge is gapped so the arrow body starts outside the file and the
 * head points at the icon’s center (replacing FileIcon’s text lines).
 */
export function FileImportIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
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
        d="M14 3H7a2 2 0 0 0-2 2v4"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 12h10"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
      />
      <path
        d="M9.5 9.5 12 12l-2.5 2.5"
        stroke="currentColor"
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
