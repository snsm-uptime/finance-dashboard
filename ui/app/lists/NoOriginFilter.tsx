"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { FormIconSubmit } from "@/components/FormIconSubmit";

import { fetchCards, type CardItem } from "../cards/cardsClient";
import { updateExpenseOrigin, type ExpenseItem, type ListsClientMessages } from "./listsClient";

export type NoOriginFilterMessages = ListsClientMessages & {
  noOriginFilterToggle: string;
  noOriginFilterAssign: string;
  noOriginFilterAssigning: string;
  noOriginFilterSelectAll: string;
  expenseOriginBlank: string;
  expenseOriginCash: string;
};

type Props = {
  listId: string;
  currentUserId: string;
  expenses: ExpenseItem[];
  messages: NoOriginFilterMessages;
};

function ownBlankOriginExpenses(expenses: ExpenseItem[], currentUserId: string): ExpenseItem[] {
  return expenses.filter((e) => e.origin_kind === null && e.payer_id === currentUserId);
}

function originFieldsFromValue(
  value: string,
): { origin_kind: "card" | "cash" | null; origin_card_id: string | null } {
  if (value === "") return { origin_kind: null, origin_card_id: null };
  if (value === "cash") return { origin_kind: "cash", origin_card_id: null };
  return { origin_kind: "card", origin_card_id: value };
}

/** Hook-free: hide when the viewer has nothing to assign so fetchCards never runs idle. */
export function NoOriginFilter(props: Props) {
  if (ownBlankOriginExpenses(props.expenses, props.currentUserId).length === 0) {
    return null;
  }
  return <NoOriginFilterPanel {...props} />;
}

function NoOriginFilterPanel({ listId, currentUserId, expenses, messages }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<CardItem[]>([]);
  const [rowValues, setRowValues] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [batchValue, setBatchValue] = useState("cash");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCards({
      errorGeneric: messages.errorGeneric,
      errorUnauthorized: messages.errorUnauthorized,
      errorInvalidLabel: messages.errorGeneric,
      errorInvalidIban: messages.errorGeneric,
      errorDuplicateIban: messages.errorGeneric,
    }).then((result) => {
      if (!cancelled && result.ok) setCards(result.cards);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const noOrigin = ownBlankOriginExpenses(expenses, currentUserId);
  const originOptions = [
    { value: "", label: messages.expenseOriginBlank },
    { value: "cash", label: messages.expenseOriginCash },
    ...cards.map((c) => ({ value: c.id, label: c.label })),
  ];
  const batchOptions = [
    { value: "cash", label: messages.expenseOriginCash },
    ...cards.map((c) => ({ value: c.id, label: c.label })),
  ];
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  async function assignOne(entryId: string, value: string, description: string): Promise<boolean> {
    const result = await updateExpenseOrigin(
      listId,
      entryId,
      originFieldsFromValue(value),
      messages,
    );
    if (!result.ok) {
      setError(`${description}: ${result.error}`);
      return false;
    }
    return true;
  }

  async function onAssignRow(entryId: string, description: string) {
    if (pending) return;
    setPending(true);
    setError(null);
    const ok = await assignOne(entryId, rowValues[entryId] ?? "", description);
    setPending(false);
    if (ok) router.refresh();
  }

  async function onAssignSelected() {
    if (pending || selectedIds.length === 0) return;
    setPending(true);
    setError(null);
    const succeededIds: string[] = [];
    for (const entryId of selectedIds) {
      const description = noOrigin.find((e) => e.id === entryId)?.description ?? entryId;
      const ok = await assignOne(entryId, batchValue, description);
      if (!ok) break;
      succeededIds.push(entryId);
    }
    setPending(false);
    if (succeededIds.length > 0) {
      // Only the rows that actually persisted are cleared/refreshed — a retry
      // after a partial failure must not resubmit (and overwrite) them.
      setSelected((prev) => {
        const next = { ...prev };
        for (const id of succeededIds) delete next[id];
        return next;
      });
      router.refresh();
    }
  }

  return (
    <details
      className="rounded-[8px] border border-border bg-surface px-[0.75rem] py-[0.55rem]"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer font-medium">
        {messages.noOriginFilterToggle} ({noOrigin.length})
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {noOrigin.map((expense) => (
            <div key={expense.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected[expense.id] === true}
                disabled={pending}
                onChange={(e) =>
                  setSelected((prev) => ({ ...prev, [expense.id]: e.target.checked }))
                }
                aria-label={expense.description}
              />
              <span className="min-w-0 flex-1 truncate text-[0.9rem]">{expense.description}</span>
              <SoftLedgerSelect
                value={rowValues[expense.id] ?? ""}
                options={originOptions}
                disabled={pending}
                aria-label={messages.noOriginFilterAssign}
                onChange={(value) =>
                  setRowValues((prev) => ({ ...prev, [expense.id]: value }))
                }
              />
              <FormIconSubmit
                type="button"
                variant="save"
                label={pending ? messages.noOriginFilterAssigning : messages.noOriginFilterAssign}
                disabled={pending || (rowValues[expense.id] ?? "") === ""}
                onClick={() => onAssignRow(expense.id, expense.description)}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <SoftLedgerSelect
            value={batchValue}
            options={batchOptions}
            disabled={pending}
            aria-label={messages.noOriginFilterSelectAll}
            onChange={setBatchValue}
          />
          <FormIconSubmit
            type="button"
            variant="save"
            fill
            label={pending ? messages.noOriginFilterAssigning : messages.noOriginFilterSelectAll}
            disabled={pending || selectedIds.length === 0}
            onClick={onAssignSelected}
          />
        </div>
        {error ? (
          <p className="m-0 text-[0.9rem] text-owe" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}
