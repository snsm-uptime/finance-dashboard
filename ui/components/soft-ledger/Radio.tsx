import type { InputHTMLAttributes, ReactNode } from "react";

import styles from "./Radio.module.css";

type SoftLedgerRadioProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> & {
  /** Radio (default) or checkbox — same outline/fill treatment. */
  type?: "radio" | "checkbox";
  children?: ReactNode;
  className?: string;
};

/**
 * Soft-Ledger choice control — 3px accent outline, fills with accent when selected.
 */
export function SoftLedgerRadio({
  type = "radio",
  children,
  className,
  disabled,
  ...rest
}: SoftLedgerRadioProps) {
  const rootClass = className ? `${styles.root} ${className}` : styles.root;
  const markClass = `${styles.mark} ${type === "checkbox" ? styles.checkbox : styles.radio}`;

  return (
    <label className={rootClass}>
      <input
        {...rest}
        type={type}
        className={styles.input}
        disabled={disabled}
      />
      <span className={markClass} aria-hidden="true" />
      {children != null ? <span className={styles.label}>{children}</span> : null}
    </label>
  );
}
