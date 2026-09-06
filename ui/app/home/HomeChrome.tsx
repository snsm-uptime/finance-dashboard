"use client";

import { useChromeHeader } from "@/components/ChromeBack";
import { ChromeAvatarLink } from "@/components/ChromeAvatarLink";
import { IconButton } from "@/components/IconButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { listsMessages } from "@/lib/i18n/lists";
import { BoxIcon } from "@/app/icons";
import { DocsHelpButton } from "@/app/docs/DocsHelpButton";

/**
 * Opts Home into AppShell's chrome: avatar takes the leading slot (Home is a
 * top-level tab, so it has no back control to replace), title follows in the
 * standard chrome layout. Owns the Lists help icon too (moved from ListsPanel)
 * so it sits alone at the chrome's opposite (trailing) end. Also owns the
 * archived-lists box-icon toggle (Story 9.2) — optional so callers that don't
 * pass `onToggleArchived` (or existing tests) render the chrome without it.
 */
export function HomeChrome({
  title,
  alias,
  userId,
  photoBase64,
  showArchived = false,
  onToggleArchived,
}: {
  title: string;
  alias: string | null;
  userId: string;
  photoBase64: string | null;
  showArchived?: boolean;
  onToggleArchived?: () => void;
}) {
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  useChromeHeader({
    leading: <ChromeAvatarLink alias={alias} userId={userId} photoBase64={photoBase64} />,
    title,
    trailing: (
      <>
        {onToggleArchived ? (
          <IconButton
            icon={<BoxIcon active={showArchived} className="size-5" />}
            label={showArchived ? t.listsShowActive : t.listsShowArchived}
            aria-pressed={showArchived}
            onClick={onToggleArchived}
          />
        ) : null}
        <DocsHelpButton pageName="Lists" docsAnchor="/docs#lists" />
      </>
    ),
  });
  return null;
}
