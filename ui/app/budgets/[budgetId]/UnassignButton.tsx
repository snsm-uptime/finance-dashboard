"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { CloseIcon } from "@/app/icons/CloseIcon";
import { IconButton } from "@/components/IconButton/IconButton";

import { unassignEntry, type BudgetDetailClientMessages } from "./budgetDetailClient";
import styles from "./UnassignButton.module.scss";

type Props = {
  budgetId: string;
  entryId: string;
  label: string;
  messages: BudgetDetailClientMessages;
};

export function UnassignButton({ budgetId, entryId, label, messages }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    const result = await unassignEntry(budgetId, entryId, messages);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <IconButton
        className={styles.destructive}
        icon={<CloseIcon />}
        label={label}
        variant="ghost"
        disabled={pending}
        onClick={onClick}
      />
      {error ? (
        <span role="alert" className="text-owe">
          {error}
        </span>
      ) : null}
    </span>
  );
}
