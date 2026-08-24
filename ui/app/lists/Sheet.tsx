"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useModalAnimation, useFocusTrap } from "@/hooks";
import { CloseIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import styles from "./Sheet.module.scss";

const CLOSE_ANIMATION_MS = 280;
const CHROME_HEADER_SELECTOR = "[data-app-chrome='header']";
/** First-paint / no-header fallback: viewport minus safe-area and chrome row. */
const FILL_BELOW_CHROME_FALLBACK =
  "calc(100dvh - env(safe-area-inset-top, 0px) - 3.25rem)";

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
  /**
   * Pinned below the scrolling body (does not scroll with `body`). Other
   * sheets omit this — default height/layout is unchanged.
   */
  footer?: ReactNode;
  /** Optional ref to focus when sheet closes (typically the button that opened it) */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** Maximum height of sheet content (default: min(72vh, 36rem)) */
  maxHeight?: string;
  /**
   * Grow from the viewport bottom up to the AppShell chrome header
   * (`data-app-chrome="header"`). Other sheets keep the default cap.
   */
  fillBelowChrome?: boolean;
};

function useFillBelowChrome(enabled: boolean): {
  maxHeight: string;
  chromeOffsetPx: number | null;
} {
  const [availablePx, setAvailablePx] = useState<number | null>(null);
  const [chromeOffsetPx, setChromeOffsetPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return;

    function measure() {
      const header = document.querySelector<HTMLElement>(CHROME_HEADER_SELECTOR);
      if (!header) {
        setAvailablePx(null);
        setChromeOffsetPx(null);
        return;
      }
      const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      setChromeOffsetPx(bottom);
      setAvailablePx(Math.max(0, Math.round(window.innerHeight - bottom)));
    }

    measure();
    const header = document.querySelector<HTMLElement>(CHROME_HEADER_SELECTOR);
    const ro = header && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (header && ro) ro.observe(header);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [enabled]);

  if (!enabled) {
    return { maxHeight: "", chromeOffsetPx: null };
  }
  return {
    maxHeight: availablePx != null ? `${availablePx}px` : FILL_BELOW_CHROME_FALLBACK,
    chromeOffsetPx,
  };
}

export function Sheet({
  open,
  onClose,
  closeLabel,
  cornerAction,
  title,
  closeButton,
  body,
  footer,
  returnFocusRef,
  maxHeight = "min(72vh, 36rem)",
  fillBelowChrome = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const defaultCloseRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { phase } = useModalAnimation(open, { closeAnimationMs: CLOSE_ANIMATION_MS });
  const fill = useFillBelowChrome(fillBelowChrome && open);

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
  const resolvedMaxHeight = fillBelowChrome ? fill.maxHeight : maxHeight;
  const sheetStyle = {
    "--sheet-max-height": resolvedMaxHeight,
    ...(fill.chromeOffsetPx != null
      ? { "--sheet-chrome-offset": `${fill.chromeOffsetPx}px` }
      : {}),
  } as CSSProperties;

  return createPortal(
    <>
      <button
        type="button"
        className={`${styles.backdrop} ${isVisible ? styles.backdropOpen : ""} ${
          fillBelowChrome ? styles.backdropFillBelowChrome : ""
        }`}
        aria-label={closeLabel}
        disabled={phase === "closing"}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`${styles.sheet} ${isVisible ? styles.sheetOpen : ""} ${
          fillBelowChrome ? styles.sheetFillBelowChrome : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={sheetStyle}
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
        {footer ? <div className={styles.sheetFooter}>{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
