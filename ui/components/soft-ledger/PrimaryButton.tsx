import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./PrimaryButton.module.css";

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Moss accent CTA — rounded.sm only; never pill. */
export function PrimaryButton({
  children,
  className,
  type = "button",
  ...rest
}: PrimaryButtonProps) {
  const classes = className ? `${styles.button} ${className}` : styles.button;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
