import type { InputHTMLAttributes, ReactNode } from "react";

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
  const rootClass = className
    ? `relative inline-flex items-center gap-[0.4rem] select-none cursor-pointer text-foreground ${className}`
    : "relative inline-flex items-center gap-[0.4rem] select-none cursor-pointer text-foreground";

  const inputClass = "peer absolute inset-0 w-full h-full m-0 p-0 opacity-0 cursor-pointer border-0";

  const markBaseClass =
    "box-border flex-shrink-0 w-[1.125rem] h-[1.125rem] border-[3px] border-accent bg-transparent transition-colors duration-[120ms] peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-55";
  const markClass =
    type === "checkbox"
      ? `${markBaseClass} rounded-[4px]`
      : `${markBaseClass} rounded-full`;

  return (
    <label
      className={`${rootClass} ${disabled ? "opacity-65 cursor-not-allowed" : ""}`}
    >
      <input
        {...rest}
        type={type}
        className={inputClass}
        disabled={disabled}
      />
      <span className={markClass} aria-hidden="true" />
      {children != null ? (
        <span style={{ lineHeight: "1.3" }}>{children}</span>
      ) : null}
    </label>
  );
}
