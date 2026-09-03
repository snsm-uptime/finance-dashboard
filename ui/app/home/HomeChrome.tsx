"use client";

import { useChromeHeader } from "@/components/ChromeBack";
import { Avatar } from "@/components/Avatar";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";

/**
 * Opts Home into AppShell's chrome: avatar takes the leading slot (Home is a
 * top-level tab, so it has no back control to replace), title follows in the
 * standard chrome layout. Owns the Lists help icon too (moved from ListsPanel)
 * so it sits alone at the chrome's opposite (trailing) end.
 */
export function HomeChrome({
  title,
  alias,
  userId,
  photoBase64,
}: {
  title: string;
  alias: string | null;
  userId: string;
  photoBase64: string | null;
}) {
  useChromeHeader({
    leading: <Avatar alias={alias} seed={userId} photoBase64={photoBase64} size="md" />,
    title,
    trailing: <DocsHelpButton pageName="Lists" docsAnchor="/docs#lists" />,
  });
  return null;
}
