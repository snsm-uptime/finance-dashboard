"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/app/icons";
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
  const [phase, setPhase] = useState<"unmounted" | "mounting" | "open" | "closing">(
    "unmounted"
  );

  // Use default close ref if no custom close button, otherwise undefined
  const closeRef = closeButton ? undefined : defaultCloseRef;

  // Respond to open prop changes: transition to mounting or closing
  useEffect(() => {
    if (open && phase === "unmounted") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("mounting");
    } else if (!open && phase !== "unmounted" && phase !== "closing") {
      setPhase("closing");
    }
  }, [open, phase]);

  // Handle mounting phase: trigger visibility animation
  useEffect(() => {
    if (phase === "mounting") {
      const show = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setPhase("open");
        });
      });
      return () => window.cancelAnimationFrame(show);
    }
  }, [phase]);

  // Handle closing phase: delay unmounting for animation and return focus
  useEffect(() => {
    if (phase === "closing") {
      const hide = window.setTimeout(() => {
        setPhase("unmounted");
        returnFocusRef?.current?.focus();
      }, CLOSE_ANIMATION_MS);
      return () => window.clearTimeout(hide);
    }
  }, [phase, returnFocusRef]);

  // Focus management and keyboard traps when sheet is visible
  useEffect(() => {
    if (phase !== "open") return;
    closeRef?.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [phase, onClose]);

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
          <div className={styles.sheetLeading}>{cornerAction}</div>
          <h2 id={titleId} className={styles.sheetTitle}>
            {title}
          </h2>
          {closeButton ?? (
            <button
              ref={defaultCloseRef}
              type="button"
              className={styles.sheetClose}
              aria-label={closeLabel}
              onClick={onClose}
            >
              <CloseIcon className={styles.closeIcon} />
            </button>
          )}
        </div>
        <div className={styles.sheetBody}>{body}</div>
      </div>
    </>,
    document.body,
  );
}
