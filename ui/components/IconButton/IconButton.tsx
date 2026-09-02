"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import styles from "./IconButton.module.scss";

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
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
};

const baseClasses =
  "inline-flex flex-shrink-0 items-center justify-center m-0 p-1 border-0 rounded-[8px] bg-transparent text-muted cursor-pointer leading-none transition-all duration-150 disabled:text-muted disabled:opacity-45 disabled:cursor-not-allowed";
const captionLayoutClasses = "flex-col gap-1";
const fillClasses = "!w-full min-w-0";

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  (
    {
      icon,
      label,
      caption,
      disabled,
      onClick,
      variant = "default",
      fill = false,
      active = false,
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
      Boolean(disabled) ||
      Boolean(caption) ||
      rest["aria-expanded"] === true ||
      !label;

    return (
      <Tooltip label={label} disabled={tooltipDisabled}>
        <button
          ref={ref}
          type="button"
          className={classes}
          disabled={disabled}
          aria-label={label}
          onClick={onClick}
          data-active={active || undefined}
          {...rest}
        >
          {icon}
          {caption ? (
            <span
              aria-hidden
              className="max-w-full text-center font-[550] text-[0.7rem] leading-tight"
            >
              {caption}
            </span>
          ) : null}
        </button>
      </Tooltip>
    );
  }
);

IconButton.displayName = "IconButton";
