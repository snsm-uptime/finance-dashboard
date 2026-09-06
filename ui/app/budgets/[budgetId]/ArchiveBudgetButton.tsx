"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { IconButton } from "@/components/IconButton";
import { BoxIcon, OpenBoxIcon } from "@/app/icons";
import {
  archiveBudget,
  unarchiveBudget,
  type BudgetsClientMessages,
} from "../budgetsClient";

type Props = {
  budgetId: string;
  isArchived: boolean;
  archiveLabel: string;
  unarchiveLabel: string;
  messages: BudgetsClientMessages;
};

/** Detail-page archive/unarchive action (Story 7.6, AC #6) — reuses the same client calls as the list tile. */
export function ArchiveBudgetButton({
  budgetId,
  isArchived,
  archiveLabel,
  unarchiveLabel,
  messages,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    const result = isArchived
      ? await unarchiveBudget(budgetId, messages)
      : await archiveBudget(budgetId, messages);
    setPending(false);
    if (result.ok) router.refresh();
  }
  const iconProps = {
    "active": isArchived,
    "className": "size-5"
  }
  return (
    <IconButton
      icon={isArchived ? <OpenBoxIcon {...iconProps} /> : <BoxIcon {...iconProps} />}
      label={isArchived ? unarchiveLabel : archiveLabel}
      disabled={pending}
      onClick={onClick}
    />
  );
}
