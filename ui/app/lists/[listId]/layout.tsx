"use client";

import type { ReactNode } from "react";
import { useChromeHeader } from "@/components/ChromeBack";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";

/**
 * Persists across the loading.tsx -> page.tsx swap for this route segment, so
 * Back + the docs button show immediately instead of waiting for the page's
 * server fetch to resolve. ListDetailChrome overwrites this with the title
 * once the list data is available.
 */
export default function ListDetailLayout({ children }: { children: ReactNode }) {
  useChromeHeader({
    backHref: "/home",
    trailing: <DocsHelpButton pageName="Lists" docsAnchor="/docs#lists" />,
  });
  return children;
}
