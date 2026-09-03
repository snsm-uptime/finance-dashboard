import Link from "next/link";
import { forwardRef } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  CSSProperties,
  ReactNode,
  Ref,
} from "react";

import styles from "./BaseButton.module.scss";

export type ButtonVariant = "primary" | "accent" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonCase = "none" | "uppercase" | "lowercase";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: styles.primary,
  accent: styles.accent,
  ghost: styles.ghost,
};

const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: "0.75rem" },
  md: { padding: "9px 16px", fontSize: "0.85rem" },
  lg: { padding: "12px 20px", fontSize: "0.95rem" },
};

const BASE_STYLE: CSSProperties = {
  fontFamily: "var(--type-button-face)",
  fontWeight: 500,
  lineHeight: "1.2",
};

type SharedProps = {
  variant: ButtonVariant;
  size?: ButtonSize;
  case?: ButtonCase;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  children: ReactNode;
};

type BaseButtonAsButtonProps = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type BaseButtonAsLinkProps = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export type BaseButtonProps = BaseButtonAsButtonProps | BaseButtonAsLinkProps;

/** Omit that distributes over a union instead of collapsing it to one member. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** App-wide button primitive — see DESIGN.md/EXPERIENCE.md under
 * _bmad-output/planning-artifacts/ux-designs/ux-finance-dashboard-2026-09-02-buttons/
 * for the visual and behavioral spec. rounded-sm only; never pill. */
export const BaseButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  BaseButtonProps
>(function BaseButton(
  {
    variant,
    size = "md",
    case: textCase = "none",
    loading = false,
    iconLeft,
    iconRight,
    children,
    className,
    href,
    style,
    ...rest
  },
  ref,
) {
  const classes = [
    "m-0 rounded-sm no-underline",
    styles.base,
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const combinedStyle: CSSProperties = {
    ...BASE_STYLE,
    ...SIZE_STYLE[size],
    textTransform: textCase === "none" ? undefined : textCase,
    ...style,
  };

  const content = (
    <>
      {loading ? (
        <Spinner />
      ) : (
        iconLeft
      )}
      <span>{children}</span>
      {!loading && iconRight}
    </>
  );

  if (href !== undefined) {
    return (
      <Link
        href={href}
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
        style={combinedStyle}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </Link>
    );
  }

  const { type = "button", disabled, ...buttonRest } =
    rest as ButtonHTMLAttributes<HTMLButtonElement>;
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      ref={ref as Ref<HTMLButtonElement>}
      className={classes}
      style={combinedStyle}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      {...buttonRest}
    >
      {content}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={`${styles.spinner} h-[1em] w-[1em]`}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
