"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CopyIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";

type Props = {
  /** The raw value copied to the clipboard on click — may differ from what's displayed. */
  value: string;
  /** aria-label / title for the button in its idle state (e.g. "Copy IBAN"). */
  label: string;
  /** Shown as a tooltip, and as the button's label, for a moment after a successful copy. */
  copiedLabel: string;
  /** Optional content rendered before the button — what wraps the copyable value. */
  children?: ReactNode;
  className?: string;
};

const COPIED_DISPLAY_MS = 1500;

export function CopyButton({ value, label, copiedLabel, children, className }: Props) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_DISPLAY_MS);
  }

  return (
    <span
      className={
        className
          ? `relative inline-flex items-center gap-1 ${className}`
          : "relative inline-flex items-center gap-1"
      }
    >
      {children}
      <IconButton
        icon={<CopyIcon style={{ width: "16px", height: "16px" }} />}
        label={copied ? copiedLabel : label}
        onClick={handleClick}
      />
      {copied ? (
        <span
          role="status"
          className="absolute -top-7 right-0 whitespace-nowrap rounded-[6px] bg-foreground text-background text-[0.7rem] font-[550] px-2 py-1 pointer-events-none z-10"
        >
          {copiedLabel}
        </span>
      ) : null}
    </span>
  );
}
