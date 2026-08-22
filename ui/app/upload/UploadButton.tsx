"use client";

import { useState, type ButtonHTMLAttributes, type PointerEvent } from "react";

import { FileImportMorphIcon, SpinnerIcon } from "@/app/icons";
import { MOTION_DURATION_MS } from "@/app/icons/motion";
import { ICON_STROKE } from "@/app/icons/stroke";
import { IconButton } from "@/components/IconButton";
import styles from "./UploadButton.module.scss";

type UploadButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  pending?: boolean;
  label: string;
  pendingLabel: string;
};

const glyphClass = "col-start-1 row-start-1 size-14";

function UploadGlyph({
  pending,
  active,
}: {
  pending: boolean;
  active: boolean;
}) {
  return (
    <span className="grid size-14 place-items-center">
      {pending ? (
        <SpinnerIcon
          className={`${glyphClass} animate-spin motion-reduce:animate-none`}
        />
      ) : (
        <FileImportMorphIcon className={glyphClass} active={active} />
      )}
    </span>
  );
}

/**
 * Square outlined upload control. Composes IconButton for focus, disabled,
 * and accessible name. Idle: muted outline (SVG stroke width) + File glyph.
 * Hover: accent fill, accent outline at 2× stroke, a lifted card shadow (M3
 * elevation level 3), and the glyph's two text lines animate into the import
 * arrow — chrome and glyph share MOTION_DURATION_MS so they move as one piece.
 * Pending: filled + spinner.
 *
 * The morph is driven from here rather than from CSS `:hover`, because the
 * glyph animates its `d` attributes in JS (see FileImportMorphIcon). Touch
 * gets press-and-release instead of hover, mirroring the sticky-hover reset
 * already in UploadButton.module.scss.
 *
 * IconButton's ghost defaults (border-0, p-1, disabled fade) collide with this
 * chrome — `!` utilities and the module hover rules make the win deterministic,
 * same pattern as FormIconSubmit.
 */
export function UploadButton({
  pending = false,
  label,
  pendingLabel,
  className,
  disabled,
  style,
  ...rest
}: UploadButtonProps) {
  const [engaged, setEngaged] = useState(false);
  const isBusy = pending || Boolean(disabled);
  const name = pending ? pendingLabel : label;
  const chromeClasses = "group !size-[10rem] !p-0 box-border !border-solid";
  const classes = [chromeClasses, styles.button, className]
    .filter(Boolean)
    .join(" ");

  const enter = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType !== "touch") setEngaged(true);
    rest.onPointerEnter?.(e);
  };
  const press = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") setEngaged(true);
    rest.onPointerDown?.(e);
  };
  const release = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "touch") setEngaged(false);
    rest.onPointerUp?.(e);
  };
  const leave = (e: PointerEvent<HTMLButtonElement>) => {
    setEngaged(false);
    rest.onPointerLeave?.(e);
  };

  return (
    <IconButton
      {...rest}
      label={name}
      disabled={isBusy}
      className={classes}
      style={{
        ...style,
        ["--upload-stroke" as string]: `${ICON_STROKE}px`,
        // Beats IconButton's `duration-150` class so the chrome can never
        // drift from the glyph; both read MOTION_DURATION_MS.
        transitionDuration: `${MOTION_DURATION_MS}ms`,
      }}
      aria-busy={pending || undefined}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={leave}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) setEngaged(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setEngaged(false);
        rest.onBlur?.(e);
      }}
      icon={<UploadGlyph pending={pending} active={engaged && !isBusy} />}
    />
  );
}
