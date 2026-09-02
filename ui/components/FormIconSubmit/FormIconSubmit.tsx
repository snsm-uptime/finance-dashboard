import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  HTMLInputTypeAttribute,
  InputHTMLAttributes,
  ReactNode,
} from "react";

import { SaveIcon, SendIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
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
  /** Accessible name (also shown as IconButton's hover/focus Tooltip). */
  label: string;
  /** Opt-in: stretch to fill the parent's width. Height stays ~2.5rem. */
  fill?: boolean;
};

/**
 * Compact icon form action. Enabled when the form is dirty / ready;
 * muted disabled look when nothing has changed (matches default-split gate).
 *
 * Composes IconButton for the interactive base (type/disabled/onClick/a11y)
 * and layers bordered surface + accent-glyph form chrome on top via the
 * `className` prop. Tailwind v4 orders generated utilities by internal
 * category, not by source order, so a same-property override (e.g. this
 * component's `p-0` vs IconButton's default `p-1`) is not guaranteed to win
 * just by being listed later in the class string — `!`-important is used on
 * the handful of utilities that collide with IconButton's ghost defaults
 * (border, background, text color, padding) to make the win deterministic.
 */
export function FormIconSubmit({
  variant = "save",
  label,
  type = "submit",
  fill = false,
  className,
  title,
  ...rest
}: FormIconSubmitProps) {
  const chromeClasses =
    "!border border-border !bg-surface enabled:!text-accent !p-0 h-[2.5rem] disabled:!opacity-65";
  const sizeClasses = fill ? "" : "w-[2.5rem]";
  const classes = [chromeClasses, sizeClasses, styles.button, className]
    .filter(Boolean)
    .join(" ");
  return (
    <IconButton
      type={type}
      label={label}
      fill={fill}
      className={classes}
      icon={<IconGlyph variant={variant} />}
      title={title}
      {...rest}
    />
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
  // Structural-only overrides on top of IconButton's own base chrome (see
  // ui/components/IconButton) — the rest (flex layout, cursor, transitions,
  // disabled look) is already identical to IconButton's defaults. `!` forces
  // the utilities that collide with IconButton's own Tailwind base classes
  // (padding, background, text color, left border) to win deterministically.
  const suffixClasses =
    "w-[2.75rem] !p-0 !border-l !border-l-border rounded-r-[8px] !bg-surface !text-accent";
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
        <IconButton
          type="submit"
          className={`${suffixClasses} ${styles.suffix}`}
          label={submitLabel}
          disabled={submitDisabled ?? disabled}
          icon={<IconGlyph variant={variant} />}
        />
      </div>
    </div>
  );
}
