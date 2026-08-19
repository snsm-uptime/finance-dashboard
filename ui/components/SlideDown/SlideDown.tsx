import type { ReactNode } from "react";

export type SlideDownProps = {
  /** When true, content expands from collapsed height to its natural height. */
  open: boolean;
  children: ReactNode;
  id?: string;
  /** `id` of the control that toggles this panel (chip, button, etc.). */
  labelledBy?: string;
  className?: string;
};

/**
 * Reusable disclosure panel: content slides down from beneath the trigger.
 * Children stay mounted so the exit animation can play; when closed the
 * panel is inert and hidden from assistive tech.
 */
export function SlideDown({ open, children, id, labelledBy, className }: SlideDownProps) {
  const gridClass = open ? "grid-rows-[1fr]" : "grid-rows-[0fr]";
  const rootClass = className
    ? `grid ${gridClass} transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${className}`
    : `grid ${gridClass} transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none`;

  return (
    <div
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      aria-hidden={!open}
      className={rootClass}
    >
      <div className="min-h-0 overflow-hidden" {...(open ? {} : { inert: true })}>
        {children}
      </div>
    </div>
  );
}
