import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  HTMLInputTypeAttribute,
  InputHTMLAttributes,
  ReactNode,
} from "react";

import { SaveIcon, SendIcon } from "@/app/icons";
import styles from "./FormIconSubmit.module.css";

export type FormIconVariant = "save" | "send";

function IconGlyph({ variant }: { variant: FormIconVariant }) {
  return variant === "send" ? (
    <SendIcon className={styles.icon} />
  ) : (
    <SaveIcon className={styles.icon} />
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
  const classes = className ? `${styles.button} ${className}` : styles.button;
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
  const rootClass = className ? `${styles.fieldRoot} ${className}` : styles.fieldRoot;
  return (
    <div className={rootClass}>
      {label != null ? (
        <label className={styles.fieldLabel} htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className={styles.group}>
        <input
          {...inputRest}
          id={id}
          className={styles.fieldInput}
          type={type}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
        <button
          type="submit"
          className={styles.suffix}
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
