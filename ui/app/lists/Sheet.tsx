"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useModalAnimation, useFocusTrap } from "@/hooks";
import { CloseIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import styles from "./Sheet.module.css";

const CLOSE_ANIMATION_MS = 280;

type Props = {
  /** Whether the sheet is open */
  open: boolean;
  /** Callback fired when sheet should close (backdrop or close button clicked) */
  onClose: () => void;
  /** Label for the close button (accessibility) */
  closeLabel: string;
  /** Content to render in the top-left corner of the sheet header */
  cornerAction?: ReactNode;
  /** Content to render in the center of the sheet header (must be non-empty for a11y) */
  title: string | ReactNode;
  /** Custom close button element; if not provided, renders default close button with closeLabel aria-label */
  closeButton?: ReactNode;
  /** Main content of the sheet */
  body: ReactNode;
  /** Optional ref to focus when sheet closes (typically the button that opened it) */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** Maximum height of sheet content (default: min(72vh, 36rem)) */
  maxHeight?: string;
};

export function Sheet({
  open,
  onClose,
  closeLabel,
  cornerAction,
  title,
  closeButton,
  body,
  returnFocusRef,
  maxHeight = "min(72vh, 36rem)",
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const defaultCloseRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { phase } = useModalAnimation(open, { closeAnimationMs: CLOSE_ANIMATION_MS });

  // Use default close ref if no custom close button, otherwise undefined
  const closeRef = closeButton ? undefined : defaultCloseRef;

  // Return focus when closing phase completes
  useEffect(() => {
    if (phase === "closing") {
      const hide = window.setTimeout(() => {
        returnFocusRef?.current?.focus();
      }, CLOSE_ANIMATION_MS);
      return () => window.clearTimeout(hide);
    }
  }, [phase, returnFocusRef, CLOSE_ANIMATION_MS]);

  // Focus management and keyboard traps when sheet is visible
  useFocusTrap({
    isActive: phase === "open",
    containerRef: panelRef,
    defaultFocusRef: closeRef,
    onEscapePress: onClose,
  });

  if (phase === "unmounted" || typeof document === "undefined") return null;

  const isVisible = phase === "open" || phase === "closing";

  return createPortal(
    <>
      <button
        type="button"
        className={`${styles.backdrop} ${isVisible ? styles.backdropOpen : ""}`}
        aria-label={closeLabel}
        disabled={phase === "closing"}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`${styles.sheet} ${isVisible ? styles.sheetOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ "--sheet-max-height": maxHeight } as React.CSSProperties}
      >
        <div className={styles.sheetHeader}>
          {cornerAction && <div className={styles.sheetLeading}>{cornerAction}</div>}
          <h2 id={titleId} className={styles.sheetTitle}>
            {title}
          </h2>
          {closeButton ?? (
            <IconButton
              ref={defaultCloseRef}
              icon={<CloseIcon />}
              label={closeLabel}
              onClick={onClose}
            />
          )}
        </div>
        <div className={styles.sheetBody}>{body}</div>
      </div>
    </>,
    document.body,
  );
}
