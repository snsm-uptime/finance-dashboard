"use client";

import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import styles from "./IconButton.module.scss";

type BaseProps = {
  icon: ReactNode;
  label: string;
  /**
   * Optional visible name under the icon. `label` stays the accessible name
   * (`aria-label` / `title`); this is visual-only and does not change callers
   * that omit it.
   */
  caption?: string;
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
  /**
   * Force the same visual state as `:hover`, for triggers that aren't a
   * pointer over the element — e.g. a keyboard shortcut activating this
   * button's action. Standard shared with FileImportMorphIcon/UploadButton's
   * `active`: the parent owns real hover/focus and this is just another way
   * to reach the identical look, not a separate state.
   */
  active?: boolean;
  /**
   * Force-suppress the hover tooltip, e.g. when the caller is showing its
   * own status tooltip in the same spot (see CopyButton's "Copied" bubble).
   */
  tooltipDisabled?: boolean;
};

type ButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> &
  BaseProps & {
    href?: never;
  };

type LinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children" | "aria-label"
> &
  BaseProps & {
    href: string;
  };

type Props = ButtonProps | LinkProps;

const baseClasses =
  "inline-flex flex-shrink-0 items-center justify-center m-0 p-1 border-0 rounded-[8px] bg-transparent text-muted cursor-pointer leading-none transition-all duration-150 disabled:text-muted disabled:opacity-45 disabled:cursor-not-allowed";
const captionLayoutClasses = "flex-col gap-1";
const fillClasses = "!w-full min-w-0";

export const IconButton = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  Props
>(
  (
    {
      icon,
      label,
      caption,
      variant = "default",
      fill = false,
      active = false,
      tooltipDisabled: tooltipDisabledProp = false,
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
    const layoutClass = caption ? captionLayoutClasses : "";
    const classes = [baseClasses, layoutClass, fill ? fillClasses : "", variantClass, styles.button, className]
      .filter(Boolean)
      .join(" ");
    const tooltipDisabled =
      Boolean(caption) ||
      rest["aria-expanded"] === true ||
      !label ||
      tooltipDisabledProp;

    const content = (
      <>
        {icon}
        {caption ? (
          <span
            aria-hidden
            className="max-w-full text-center font-[550] text-[0.7rem] leading-tight"
          >
            {caption}
          </span>
        ) : null}
      </>
    );

    const isLink = "href" in rest && rest.href;

    if (isLink) {
      const { href, disabled: _, ...linkProps } = rest as any;
      return (
        <Tooltip label={label} disabled={tooltipDisabled}>
          <Link
            ref={ref as any}
            href={href}
            className={classes}
            aria-label={label}
            data-active={active || undefined}
            {...linkProps}
          >
            {content}
          </Link>
        </Tooltip>
      );
    }

    const { disabled, onClick, ...buttonProps } = rest as any;
    return (
      <Tooltip label={label} disabled={tooltipDisabled}>
        <button
          ref={ref as any}
          type="button"
          className={classes}
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          data-active={active || undefined}
          {...buttonProps}
        >
          {content}
        </button>
      </Tooltip>
    );
  }
);

IconButton.displayName = "IconButton";
