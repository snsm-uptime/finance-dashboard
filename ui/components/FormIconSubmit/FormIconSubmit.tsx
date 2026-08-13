import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  HTMLInputTypeAttribute,
  InputHTMLAttributes,
  ReactNode,
} from "react";

import { SaveIcon, SendIcon } from "@/app/icons";
import styles from "./FormIconSubmit.module.scss";

export type FormIconVariant = "save" | "send";

function IconGlyph({ variant }: { variant: FormIconVariant }) {
  return variant === "send" ? (
    <SendIcon className="block w-[1.2rem] h-[1.2rem]" />
  ) : (
    <SaveIcon className="block w-[1.2rem] h-[1.2rem]" />
  );
}

type FormIconSubmitProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  /** Visual glyph — save for persist actions, send for invite. */
  variant?: FormIconVariant;
  /** Accessible name (also used as tooltip via title). */
  label: string;
};

/**
 * Compact icon form action. Enabled when the form is dirty / ready;
 * muted disabled look when nothing has changed (matches default-split gate).
 */
export function FormIconSubmit({
  variant = "save",
  label,
  type = "submit",
  className,
  title,
  ...rest
}: FormIconSubmitProps) {
  const baseClasses =
    "inline-flex items-center justify-center w-[2.5rem] h-[2.5rem] m-0 p-0 border border-border rounded-[8px] bg-surface text-accent cursor-pointer leading-none flex-shrink-0 transition-all duration-150 disabled:text-muted disabled:opacity-65 disabled:cursor-not-allowed";
  const classes = className ? `${baseClasses} ${styles.button} ${className}` : `${baseClasses} ${styles.button}`;
  return (
    <button
      type={type}
      className={classes}
      aria-label={label}
      title={title ?? label}
      {...rest}
    >
      <IconGlyph variant={variant} />
    </button>
  );
}

type FormIconFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "children" | "onChange" | "type"
> & {
  /** Visible field label (associated via htmlFor). Optional — if not provided, label is hidden. */
  label?: ReactNode;
  /** Accessible name for the suffix submit control. */
  submitLabel: string;
  /** Input type — email, text, number, etc. */
  type?: HTMLInputTypeAttribute;
  /** Icon on the suffix button. */
  variant?: FormIconVariant;
  /** Disable only the suffix (input may stay editable). */
  submitDisabled?: boolean;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Single rounded control: input (left radii) + icon submit suffix (right radii).
 * Nest inside a parent `<form>` — the suffix is `type="submit"`.
 */
export function FormIconField({
  id,
  label,
  submitLabel,
  type = "text",
  variant = "send",
  submitDisabled,
  disabled,
  className,
  value,
  onChange,
  ...inputRest
}: FormIconFieldProps) {
  const rootClasses = "flex flex-col gap-[0.35rem] min-w-0 w-full";
  const labelClasses =
    "text-[0.875rem] font-semibold text-foreground";
  const groupClasses =
    "flex items-stretch w-full min-w-0 box-border border border-border rounded-[8px] bg-[var(--background,var(--surface))] overflow-hidden transition-all duration-150 disabled:opacity-65 disabled:cursor-not-allowed";
  const inputClasses =
    "block flex-1 min-w-0 w-full box-border m-0 py-[0.6rem] px-[0.75rem] border-0 rounded-l-[8px] bg-transparent text-foreground text-base font-normal leading-[1.4] appearance-none disabled:opacity-65 disabled:cursor-not-allowed";
  const suffixClasses =
    "inline-flex items-center justify-center flex-shrink-0 w-[2.75rem] m-0 p-0 border-0 border-l border-l-border rounded-r-[8px] bg-surface text-accent cursor-pointer leading-none transition-all duration-150 disabled:text-muted disabled:opacity-45 disabled:cursor-not-allowed";
  const rootClass = className
    ? `${rootClasses} ${className}`
    : rootClasses;
  return (
    <div className={rootClass}>
      {label != null ? (
        <label className={labelClasses} htmlFor={id} style={{ fontFamily: "var(--font-ui), system-ui, sans-serif" }}>
          {label}
        </label>
      ) : null}
      <div className={`${groupClasses} ${styles.group}`}>
        <input
          {...inputRest}
          id={id}
          className={inputClasses}
          style={{ fontFamily: "var(--font-ui), system-ui, sans-serif" }}
          type={type}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
        <button
          type="submit"
          className={`${suffixClasses} ${styles.suffix}`}
          aria-label={submitLabel}
          title={submitLabel}
          disabled={submitDisabled ?? disabled}
        >
          <IconGlyph variant={variant} />
        </button>
      </div>
    </div>
  );
}
