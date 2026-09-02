"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { unassignEntry, type BudgetDetailClientMessages } from "./budgetDetailClient";

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
      <button
        type="button"
        className="cursor-pointer border-none bg-transparent text-muted disabled:opacity-55"
        disabled={pending}
        onClick={onClick}
      >
        {label}
      </button>
      {error ? (
        <span role="alert" className="text-owe">
          {error}
        </span>
      ) : null}
    </span>
  );
}
