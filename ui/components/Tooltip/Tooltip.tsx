"use client";

import type { ReactNode } from "react";

import styles from "./Tooltip.module.scss";

type Props = {
  /** Text shown in the bubble. Empty/falsy suppresses the tooltip entirely. */
  label: string;
  /** Suppresses the tooltip (e.g. the trigger is disabled or already self-labeled). */
  disabled?: boolean;
  /** The trigger element(s) this tooltip wraps — rendered as-is, ref untouched. */
  children: ReactNode;
  /**
   * Extra classes for the wrapper `<span>` — used by callers (e.g. IconButton)
   * that need layout classes like `flex-shrink-0` or fill-width utilities to
   * land on the actual flex/grid item their parents see, since this wrapper
   * replaces the trigger as that item once inserted.
   */
  wrapperClassName?: string;
};

export function Tooltip({ label, disabled = false, children, wrapperClassName }: Props) {
  const suppressed = disabled || !label;
  const classes = [styles.wrapper, wrapperClassName].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {children}
      {suppressed ? null : (
        <span className={styles.bubble} data-testid="tooltip-bubble">
          {label}
        </span>
      )}
    </span>
  );
}
