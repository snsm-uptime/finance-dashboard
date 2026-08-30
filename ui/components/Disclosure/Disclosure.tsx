"use client";

import { useId, useState, type ReactNode } from "react";

import { BackIcon } from "@/app/icons";
import { SlideDown } from "@/components/SlideDown";

export type DisclosureProps = {
  title: string;
  children: ReactNode;
  /** Uncontrolled initial state — this component owns its own open/closed toggle. */
  defaultOpen?: boolean;
  /** Extra content in the header row, outside the toggle button (e.g. a copy action). */
  headerExtra?: ReactNode;
  className?: string;
};

const titleStyle = { fontFamily: "var(--type-body-face)", fontWeight: 550 } as const;

/**
 * Section header whose title is the toggle: the same chevron used by the
 * chrome header's back control (pointing at the label when closed, down when
 * open) plus a label, driving a `SlideDown` body. Built on top of `SlideDown`
 * rather than folded into it, since `SlideDown` is also used bare (no
 * title/trigger) by OriginChipPicker and CardRoutingControl.
 */
export function Disclosure({ title, children, defaultOpen = false, headerExtra, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const triggerId = useId();
  const panelId = useId();

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 cursor-pointer items-center gap-[var(--space-2)] border-0 bg-transparent p-0 text-left text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <BackIcon
            className={`size-3 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "-rotate-90" : "rotate-180"}`}
          />
          <span style={titleStyle}>{title}</span>
        </button>
        {headerExtra}
      </div>
      <SlideDown open={open} id={panelId} labelledBy={triggerId} className="mt-[var(--space-2)]">
        {children}
      </SlideDown>
    </div>
  );
}
