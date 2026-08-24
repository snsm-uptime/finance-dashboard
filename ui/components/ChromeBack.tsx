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
  title?: string | null;
  details?: string | null;
  trailing?: ReactNode;
};

const emptyHeader: ChromeHeaderConfig = {};

const ChromeHeaderContext = createContext<ChromeHeaderConfig>(emptyHeader);
const ChromeHeaderSetContext = createContext<
  ((header: ChromeHeaderConfig | null) => void) | null
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
    header.backHref || header.onBack || header.title || header.details || header.trailing,
  );
}

/**
 * Opt-in: while this screen is mounted, drive AppShell's top nav.
 * No-op if the provider is not in the tree (e.g. isolated panel tests).
 */
export function useChromeHeader(config: ChromeHeaderConfig) {
  const setHeader = useContext(ChromeHeaderSetContext);
  const { backHref, onBack, title, details, trailing } = config;
  useEffect(() => {
    if (!setHeader) return;
    setHeader({ backHref, onBack, title, details, trailing });
    return () => setHeader(emptyHeader);
  }, [setHeader, backHref, onBack, title, details, trailing]);
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
