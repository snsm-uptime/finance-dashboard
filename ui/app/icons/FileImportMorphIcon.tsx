"use client";

import { useEffect, useRef, type SVGProps } from "react";

import { MOTION_DURATION_MS } from "./motion";
import { ICON_STROKE } from "./stroke";

/**
 * FileIcon that animates into FileImportIcon, driven by the `active` prop.
 *
 * Choreography, as t goes 0 -> 1:
 *
 *   body   the left edge gaps open, so the arrow can pass through it
 *   shaft  FileIcon's LONG line slides left and stretches into the arrow shaft
 *   head   FileIcon's SHORT line folds up into the arrowhead
 *
 * The short line and the arrowhead are the same path: `M8 17 13 17l0 0` draws
 * exactly FileIcon's `M8 17h5`, but as an M,L,l polyline whose third point is
 * collapsed onto the second. Interpolating it to `M9.5 9.5 12 12l-2.5 2.5`
 * swings the line up and unfolds the second arm out of it. Both lines finish
 * on (12,12), so shaft end and arrow vertex meet exactly.
 *
 * Why JS and not a CSS `d` transition: the CSS `d` property is not supported
 * everywhere, and where it is missing a stylesheet can only cross-fade, which
 * is not this animation. Writing the `d` attribute works in every browser.
 * These shapes are cheap closed-form templates -- no path parsing involved.
 */

/** Trim float noise so the emitted `d` stays readable in devtools. */
const n = (v: number) => String(Math.round(v * 1000) / 1000);

const bodyAt = (t: number) =>
  `M5 ${n(9 + 6 * t)}v${n(10 - 6 * t)}a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5`;

const shaftAt = (t: number) => `M${n(8 - 6 * t)} ${n(13 - t)}h${n(8 + 2 * t)}`;

const headAt = (t: number) =>
  `M${n(8 + 1.5 * t)} ${n(17 - 7.5 * t)} ${n(13 - t)} ${n(17 - 5 * t)}` +
  `l${n(-2.5 * t)} ${n(2.5 * t)}`;

/** Matches the ease-in-out feel of the button's own hover chrome. */
const ease = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

type Props = Omit<SVGProps<SVGSVGElement>, "ref"> & {
  /** Drive the morph. The parent owns hover/focus, so one glyph serves both. */
  active?: boolean;
};

export function FileImportMorphIcon({
  active = false,
  className,
  ...props
}: Props) {
  const body = useRef<SVGPathElement>(null);
  const shaft = useRef<SVGPathElement>(null);
  const head = useRef<SVGPathElement>(null);
  const progress = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const apply = (t: number) => {
      body.current?.setAttribute("d", bodyAt(t));
      shaft.current?.setAttribute("d", shaftAt(t));
      head.current?.setAttribute("d", headAt(t));
    };

    const to = active ? 1 : 0;
    const from = progress.current;
    if (from === to) return;

    // Reduced motion still needs the end state, just not the travel.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      progress.current = to;
      apply(to);
      return;
    }

    // Scale the duration by the distance left, so a reversal mid-flight does
    // not crawl back at full length.
    const span = Math.abs(to - from);
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / (MOTION_DURATION_MS * span));
      progress.current = from + (to - from) * ease(p);
      apply(progress.current);
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame.current);
  }, [active]);

  const stroke = {
    stroke: "currentColor",
    strokeWidth: ICON_STROKE,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  // Server render is t=0, i.e. exactly FileIcon -- no hydration mismatch.
  return (
    <svg
      className={["file-import-morph", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v4" {...stroke} />
      <path ref={body} className="fim-body" d={bodyAt(0)} {...stroke} />
      <path d="M14 3v5h5" {...stroke} />
      <path ref={shaft} className="fim-shaft" d={shaftAt(0)} {...stroke} />
      <path ref={head} className="fim-head" d={headAt(0)} {...stroke} />
    </svg>
  );
}
