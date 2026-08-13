"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./IconButton.module.scss";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  icon: ReactNode;
  label: string;
  variant?: "default" | "muted";
};

const baseClasses =
  "inline-flex flex-shrink-0 items-center justify-center m-0 p-1 border-0 rounded-[8px] bg-transparent text-muted cursor-pointer leading-none transition-all duration-150 disabled:text-muted disabled:opacity-45 disabled:cursor-not-allowed";
const mutedClasses = "";

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  (
    {
      icon,
      label,
      disabled,
      onClick,
      variant = "default",
      className,
      ...rest
    },
    ref
  ) => {
    const variantClass = variant === "muted" ? styles.muted : "";
    const classes = className
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
