import { RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type UseFocusTrapOptions = {
  isActive: boolean;
  containerRef: RefObject<HTMLElement | null>;
  defaultFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onEscapePress?: () => void;
};

export function useFocusTrap({
  isActive,
  containerRef,
  defaultFocusRef,
  returnFocusRef,
  onEscapePress,
}: UseFocusTrapOptions): void {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Focus initial element and hide body overflow
    const initialFocus = defaultFocusRef?.current || getFirstFocusable(containerRef.current);
    initialFocus?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapePress?.();
        return;
      }

      if (event.key !== "Tab" || !containerRef.current) return;

      const focusable = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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
      returnFocusRef?.current?.focus();
    };
  }, [isActive, containerRef, defaultFocusRef, returnFocusRef, onEscapePress]);
}

function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return focusable.length > 0 ? focusable[0] : null;
}
