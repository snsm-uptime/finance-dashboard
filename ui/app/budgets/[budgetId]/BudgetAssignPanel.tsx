"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { FormIconSubmit } from "@/components/FormIconSubmit";
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
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<BudgetCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstCandidateRef = useRef<HTMLInputElement>(null);

  async function openPicker() {
    setError(null);
    setSelectedIds(new Set());
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

  function toggleSelected(id: string, selected: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirmAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError(null);
    for (const id of selectedIds) {
      const result = await assignEntry(budgetId, id, messages);
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
    }
    setBusy(false);
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
        initialFocusRef={firstCandidateRef}
        cornerAction={
          <FormIconSubmit
            type="submit"
            form={formId}
            tabIndex={0}
            variant="save"
            label={
              busy
                ? messages.budgetsAssigning
                : selectedIds.size > 0
                  ? `${messages.budgetsAssignSubmit} (${selectedIds.size})`
                  : messages.budgetsAssignSubmit
            }
            disabled={selectedIds.size === 0 || busy}
          />
        }
        body={
          <form
            id={formId}
            className="flex flex-col gap-[var(--space-3)]"
            onSubmit={confirmAssign}
          >
            <ul className="m-0 list-none p-0">
              {candidates.length === 0 ? (
                <li className="py-[var(--space-3)] text-muted">{messages.budgetsAssignEmpty}</li>
              ) : (
                candidates.map((item, index) => {
                  const selected = selectedIds.has(item.id);
                  return (
                    <li key={item.id} className="border-b border-border">
                      <label
                        className={`flex w-full cursor-pointer items-center justify-between gap-[var(--space-2)] px-0 py-[var(--space-3)] text-foreground ${
                          selected ? "bg-accent/10" : "hover:bg-accent/10"
                        } ${busy ? "cursor-not-allowed opacity-55" : ""}`}
                      >
                        <span className="flex min-w-0 items-center gap-[var(--space-2)]">
                          <input
                            ref={index === 0 ? firstCandidateRef : undefined}
                            type="checkbox"
                            className="peer sr-only"
                            checked={selected}
                            disabled={busy}
                            onChange={(event) => toggleSelected(item.id, event.target.checked)}
                          />
                          <span
                            aria-hidden="true"
                            className="box-border h-[1.125rem] w-[1.125rem] flex-shrink-0 rounded-[4px] border-[3px] border-accent bg-transparent transition-colors duration-[120ms] peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
                          />
                          <span className="min-w-0 truncate text-left">{item.description}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted">
                          {formatMoneyAmount(item.amount_crc, "CRC")}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
            {error ? (
              <p role="alert" className="m-0 text-owe">
                {error}
              </p>
            ) : null}
          </form>
        }
      />
    </>
  );
}
