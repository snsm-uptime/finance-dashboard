"use client";

import { useState } from "react";

import { ListsPanel } from "@/app/lists/ListsPanel";
import type { ListItem } from "@/app/lists/listsClient";
import { HomeChrome } from "./HomeChrome";

type Props = {
  title: string;
  alias: string | null;
  userId: string;
  photoBase64: string | null;
  initialLists: ListItem[];
  currentUserId: string;
};

/**
 * Owns the archived-lists toggle state shared between the chrome (renders
 * the box icon) and the panel (filters what's shown) — `HomeChrome` and
 * `ListsPanel` are independent sibling client components under the Server
 * Component `page.tsx`, so the toggle state has to live in a shared parent
 * rather than in either sibling. Unmounting this component (navigating away
 * from Home) drops the state, satisfying "reverts to OFF on navigate away"
 * (Story 9.2 AC #4) with no extra reset code.
 */
export function HomeListsSection({
  title,
  alias,
  userId,
  photoBase64,
  initialLists,
  currentUserId,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  return (
    <>
      <HomeChrome
        title={title}
        alias={alias}
        userId={userId}
        photoBase64={photoBase64}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((prev) => !prev)}
      />
      <ListsPanel
        initialLists={initialLists}
        currentUserId={currentUserId}
        showArchived={showArchived}
      />
    </>
  );
}
