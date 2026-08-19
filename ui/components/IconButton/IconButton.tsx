"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./IconButton.module.scss";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  icon: ReactNode;
  label: string;
  variant?: "default" | "muted" | "ghost";
  /**
   * Opt-in: stretch to fill the parent's width instead of hugging content.
   * Default (false) keeps every existing caller's compact ghost button
   * byte-identical. `flex-shrink-0` (from `baseClasses`) is kept regardless
   * of `fill` so the button never shrinks below its full-width basis; `!`
   * on `w-full` guards against a future conflicting width utility passed via
   * `className`, since Tailwind v4 orders generated utilities by internal
   * category, not source order.
   */
  fill?: boolean;
};

const baseClasses =
  "inline-flex flex-shrink-0 items-center justify-center m-0 p-1 border-0 rounded-[8px] bg-transparent text-muted cursor-pointer leading-none transition-all duration-150 disabled:text-muted disabled:opacity-45 disabled:cursor-not-allowed";
const fillClasses = "!w-full min-w-0";

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  (
    {
      icon,
      label,
      disabled,
      onClick,
      variant = "default",
      fill = false,
      className,
      ...rest
    },
    ref
  ) => {
    const variantClass =
      variant === "muted"
        ? styles.muted
        : variant === "ghost"
          ? styles.ghost
          : "";
    const classes = fill
      ? className
        ? `${baseClasses} ${fillClasses} ${variantClass} ${styles.button} ${className}`
        : `${baseClasses} ${fillClasses} ${variantClass} ${styles.button}`
      : className
        ? `${baseClasses} ${variantClass} ${styles.button} ${className}`
        : `${baseClasses} ${variantClass} ${styles.button}`;

    return (
      <button
        ref={ref}
        type="button"
        className={classes}
        disabled={disabled}
        aria-label={label}
        title={label}
        onClick={onClick}
        {...rest}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
