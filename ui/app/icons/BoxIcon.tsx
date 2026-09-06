import type { SVGProps } from "react";
import { ICON_STROKE } from "./stroke";

type Props = SVGProps<SVGSVGElement> & {
  /** Closed box (false) vs open box (true) — drives a CSS lid-rotation morph. */
  active?: boolean;
};

const stroke = {
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const strokeWidth = ICON_STROKE - 0.5;

export function BoxIcon({ active = false, className, ...props }: Props) {
  return (
    <svg
      className={["box-icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-active={active || undefined}
      {...props}
    >
      <g transform="translate(12,12) scale(0.08)" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="0,-120 104,-60 0,0 -104,-60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <polygon points="-104,-60 0,0 0,120 -104,60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <polygon points="104,-60 0,0 0,120 104,60" {...stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        <line x1="-52" y1="-90" x2="52" y2="-30" {...stroke} strokeWidth={strokeWidth + 0.35} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

