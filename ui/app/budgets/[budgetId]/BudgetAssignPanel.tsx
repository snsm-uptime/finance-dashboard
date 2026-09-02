"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { formatMoneyAmount } from "@/lib/currency";

import { Sheet } from "@/app/lists/Sheet";
import {
  assignEntry,
  fetchCandidates,
  type BudgetCandidate,
  type BudgetDetailClientMessages,
} from "./budgetDetailClient";

export type BudgetAssignPanelMessages = BudgetDetailClientMessages & {
  budgetsAssignTitle: string;
  budgetsAssignEmpty: string;
  budgetsAssignSubmit: string;
  budgetsAssigning: string;
  cancelLabel: string;
};

type Props = {
  budgetId: string;
  messages: BudgetAssignPanelMessages;
};

export function BudgetAssignPanel({ budgetId, messages }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<BudgetCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function openPicker() {
    setError(null);
    setSelectedId(null);
    const result = await fetchCandidates(budgetId, messages);
    if (!result.ok) {
      setCandidates([]);
      setError(result.error);
      setOpen(true);
      return;
    }
    setCandidates(result.candidates);
    setOpen(true);
  }

  async function confirmAssign() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    const result = await assignEntry(budgetId, selectedId, messages);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        className="self-start px-[var(--space-4)] py-[var(--space-2)] rounded-sm bg-accent text-background font-semibold"
        onClick={openPicker}
      >
        {messages.budgetsAssignTitle}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        closeLabel={messages.cancelLabel}
        title={messages.budgetsAssignTitle}
        body={
          <div className="flex flex-col gap-[var(--space-3)]">
            <ul className="m-0 list-none p-0">
              {candidates.length === 0 ? (
                <li className="py-[var(--space-3)] text-muted">{messages.budgetsAssignEmpty}</li>
              ) : (
                candidates.map((item) => (
                  <li key={item.id} className="border-b border-border">
                    <button
                      type="button"
                      className="w-full cursor-pointer border-none bg-transparent px-0 py-[var(--space-3)] text-left text-foreground flex justify-between gap-[var(--space-2)]"
                      aria-pressed={selectedId === item.id}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>{item.description}</span>
                      <span className="tabular-nums text-muted">
                        {formatMoneyAmount(item.amount_crc, "CRC")}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            {error ? (
              <p role="alert" className="m-0 text-owe">
                {error}
              </p>
            ) : null}
          </div>
        }
        footer={
          <div className="flex justify-end gap-[var(--space-2)]">
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent text-muted"
              onClick={() => setOpen(false)}
            >
              {messages.cancelLabel}
            </button>
            <PrimaryButton onClick={confirmAssign} disabled={!selectedId || busy}>
              {busy ? messages.budgetsAssigning : messages.budgetsAssignSubmit}
            </PrimaryButton>
          </div>
        }
      />
    </>
  );
}
