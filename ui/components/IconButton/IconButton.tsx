"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./IconButton.module.css";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  icon: ReactNode;
  label: string;
  variant?: "default" | "muted";
};

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
    const classes =
      className
        ? `${styles.button} ${variant === "muted" ? styles.muted : ""} ${className}`
        : `${styles.button} ${variant === "muted" ? styles.muted : ""}`;

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
