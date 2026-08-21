"use client";

import type { ButtonHTMLAttributes } from "react";

import { FileIcon, FileImportIcon, SpinnerIcon } from "@/app/icons";
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

function UploadGlyph({ pending }: { pending: boolean }) {
  return (
    <span className="grid size-14 place-items-center">
      {pending ? (
        <SpinnerIcon
          className={`${glyphClass} animate-spin motion-reduce:animate-none`}
        />
      ) : (
        <>
          <FileIcon className={`${glyphClass} group-hover:invisible`} />
          <FileImportIcon className={`${glyphClass} invisible group-hover:visible`} />
        </>
      )}
    </span>
  );
}

/**
 * Square outlined upload control. Composes IconButton for focus, disabled,
 * and accessible name. Idle: muted outline (SVG stroke width) + File glyph.
 * Hover: accent fill, accent outline at 2× stroke, File-import. Pending:
 * filled + spinner.
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
  const isBusy = pending || Boolean(disabled);
  const name = pending ? pendingLabel : label;
  const chromeClasses =
    "group !size-28 !p-0 box-border !border-solid !rounded-sm";
  const classes = [chromeClasses, styles.button, className].filter(Boolean).join(" ");

  return (
    <IconButton
      {...rest}
      label={name}
      disabled={isBusy}
      className={classes}
      style={{
        ...style,
        ["--upload-stroke" as string]: `${ICON_STROKE}px`,
      }}
      aria-busy={pending || undefined}
      icon={<UploadGlyph pending={pending} />}
    />
  );
}
