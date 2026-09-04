"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type ChromeHeaderConfig = {
  /** When set, AppShell renders a ghost Back IconButton that pushes this href. */
  backHref?: string | null;
  /** When set, Back runs this instead of pushing `backHref` (e.g. discard then navigate). */
  onBack?: (() => void) | null;
  /**
   * Replaces the Back button in the same fixed leading slot (e.g. an Avatar on
   * top-level tabs that have no back navigation). Ignored if `backHref`/`onBack`
   * is also set — Back takes priority.
   */
  leading?: ReactNode;
  title?: ReactNode;
  /** Short inline content next to the title (e.g. a status word or a count) — not for large/interactive elements. */
  details?: ReactNode;
  /**
   * Overrides the `details` chip's border/text color classes (e.g. `"border-owe text-owe"`
   * for an over-budget state) — full Tailwind classes, not limited to the fixed Chip tones.
   */
  detailsClassName?: string;
  trailing?: ReactNode;
  /**
   * Optional full-width strip rendered edge-to-edge above the header row,
   * outside the scrollable content area — stays visible while the page
   * scrolls (e.g. a `TopProgressBar`).
   */
  progressBar?: ReactNode | null;
};

const emptyHeader: ChromeHeaderConfig = {};

const ChromeHeaderContext = createContext<ChromeHeaderConfig>(emptyHeader);
const ChromeHeaderSetContext = createContext<
  ((header: ChromeHeaderConfig) => void) | null
>(null);

/** Owns AppShell's top nav. Screens opt in via `useChromeHeader` or `useChromeBack`. */
export function ChromeBackProvider({ children }: { children: ReactNode }) {
  const [header, setHeader] = useState<ChromeHeaderConfig>(emptyHeader);
  return (
    <ChromeHeaderSetContext.Provider value={setHeader}>
      <ChromeHeaderContext.Provider value={header}>{children}</ChromeHeaderContext.Provider>
    </ChromeHeaderSetContext.Provider>
  );
}

export function useChromeHeaderState(): ChromeHeaderConfig {
  return useContext(ChromeHeaderContext);
}

export function chromeHeaderIsActive(header: ChromeHeaderConfig): boolean {
  return Boolean(
    header.backHref ||
      header.onBack ||
      header.leading ||
      header.title ||
      header.details ||
      header.trailing,
  );
}

/**
 * Opt-in: while this screen is mounted, drive AppShell's top nav.
 * No-op if the provider is not in the tree (e.g. isolated panel tests).
 */
export function useChromeHeader(config: ChromeHeaderConfig) {
  const setHeader = useContext(ChromeHeaderSetContext);
  const {
    backHref,
    onBack,
    leading,
    title,
    details,
    detailsClassName,
    trailing,
    progressBar,
  } = config;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({
      backHref,
      onBack,
      leading,
      title,
      details,
      detailsClassName,
      trailing,
      progressBar,
    });
    return () => setHeader(emptyHeader);
  }, [
    setHeader,
    backHref,
    onBack,
    leading,
    title,
    details,
    detailsClassName,
    trailing,
    progressBar,
  ]);
}

export function useChromeBackHref(): string | null {
  return useContext(ChromeHeaderContext).backHref ?? null;
}

/**
 * Opt-in: while this screen is mounted, show AppShell's Back control
 * and navigate to `href` on click. Prefer `useChromeHeader` when the
 * screen also has a title, details, or trailing actions.
 */
export function useChromeBack(href: string) {
  useChromeHeader({ backHref: href });
}
