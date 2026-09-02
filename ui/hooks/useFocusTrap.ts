import { RefObject, useEffect } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type UseFocusTrapOptions = {
  isActive: boolean;
  containerRef: RefObject<HTMLElement | null>;
  defaultFocusRef?: RefObject<HTMLElement | null>;
  onEscapePress?: () => void;
};

export function useFocusTrap({
  isActive,
  containerRef,
  defaultFocusRef,
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

      const focusable = Array.from(
        containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      // Advance the whole sequence ourselves rather than only guarding the
      // first/last boundary and otherwise trusting native Tab traversal:
      // Safari's default Tab order (Full Keyboard Access off, the macOS
      // default) skips checkboxes and buttons entirely, so a native
      // mid-sequence Tab press can jump straight out of the page to browser
      // chrome (e.g. the address bar) instead of landing on our next
      // element. Owning every Tab press keeps behavior identical across
      // browsers.
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? -1 : 1;
      const nextIndex =
        currentIndex === -1
          ? event.shiftKey
            ? focusable.length - 1
            : 0
          : (currentIndex + step + focusable.length) % focusable.length;
      focusable[nextIndex].focus();
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isActive, containerRef, defaultFocusRef, onEscapePress]);
}

function getFirstFocusable(container: HTMLElement): HTMLElement | null {
  const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return focusable.length > 0 ? focusable[0] : null;
}
