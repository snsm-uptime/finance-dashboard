"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useFormSubmission } from "@/hooks";
import { HashtagIcon, PercentageIcon, UserIcon } from "@/app/icons";
import { FormIconSubmit } from "@/components/FormIconSubmit";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { TriSwitch } from "@/components/TriSwitch";

import {
  emptyMemberMap,
  evenPercentMap,
  nonEmptyEntries,
  percentMapsEqual,
} from "./ManualExpenseForm";
import { PercentageSplitTrack } from "./PercentageSplitTrack";
import { Sheet } from "./Sheet";
import {
  memberLabel,
  updateExpense,
  type ExpenseItem,
  type ListMember,
  type ListsClientMessages,
  type UpdateExpenseBody,
} from "./listsClient";

export type EditExpenseFormMessages = ListsClientMessages & {
  editExpenseTitle: string;
  expenseAmount: string;
  expenseDescription: string;
  expensePayer: string;
  editExpenseDateLabel: string;
  editExpenseSave: string;
  editExpenseSaving: string;
  editExpenseCancel: string;
  expenseAdjustSplit: string;
  expenseModeWhole: string;
  expenseModeAbsolute: string;
  expenseModePercentage: string;
  expenseAssignee: string;
};

type SplitMode = "whole_assignee" | "absolute_amounts" | "percentage";

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  expense: ExpenseItem;
  messages: EditExpenseFormMessages;
  open: boolean;
  onClose: () => void;
};

/** Full edit (amount incl. sign, description, payer, date, split) for a committed entry — any provenance. */
export function EditExpenseForm({
  listId,
  currentUserId,
  members,
  expense,
  messages,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const baseId = useId();
  const memberOptions = members.map((m) => ({ value: m.user_id, label: memberLabel(m) }));

  const [amount, setAmount] = useState(expense.amount);
  const [description, setDescription] = useState(expense.description);
  const [payerId, setPayerId] = useState(expense.payer_id);
  const [postedDate, setPostedDate] = useState(expense.posted_date);
  const [mode, setMode] = useState<SplitMode>("percentage");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [absoluteAmounts, setAbsoluteAmounts] = useState<Record<string, string>>(() =>
    emptyMemberMap(members),
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    evenPercentMap(members),
  );

  const activePayerId = useMemo(
    () => (members.some((m) => m.user_id === payerId) ? payerId : ""),
    [members, payerId],
  );
  const activeAssigneeId = useMemo(
    () => (members.some((m) => m.user_id === assigneeId) ? assigneeId : ""),
    [members, assigneeId],
  );

  function buildSplitOverride():
    | { ok: true; value: UpdateExpenseBody["split_override"] | undefined }
    | { ok: false; error: string } {
    if (mode === "whole_assignee") {
      return { ok: true, value: { kind: "whole_assignee", assignee_id: activeAssigneeId } };
    }
    if (mode === "absolute_amounts") {
      const amounts = nonEmptyEntries(absoluteAmounts);
      if (!amounts) return { ok: false, error: messages.errorGeneric };
      return { ok: true, value: { kind: "absolute_amounts", amounts } };
    }
    const baseline = evenPercentMap(members);
    if (percentMapsEqual(percentages, baseline)) {
      return { ok: true, value: undefined };
    }
    const pct = nonEmptyEntries(percentages);
    if (!pct) return { ok: false, error: messages.errorGeneric };
    return { ok: true, value: { kind: "percentage", percentages: pct } };
  }

  const { pending, error, submit, clearError } = useFormSubmission(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- useFormSubmission<T> requires a parameter; this form has no per-submit payload
    async (_unused: void) => {
      const override = buildSplitOverride();
      if (!override.ok) return { ok: false, error: override.error };
      return updateExpense(
        listId,
        expense.id,
        {
          amount: amount.trim(),
          currency: expense.currency,
          description: description.trim(),
          payer_id: activePayerId,
          posted_date: postedDate,
          split_override: override.value,
        },
        messages,
      );
    },
    {
      onSuccess: () => {
        onClose();
        router.refresh();
      },
    },
  );

  const canSubmit =
    amount.trim().length > 0 &&
    description.trim().length > 0 &&
    !!activePayerId &&
    postedDate.trim().length > 0 &&
    (mode !== "whole_assignee" || !!activeAssigneeId) &&
    !pending;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      closeLabel={messages.editExpenseCancel}
      title={messages.editExpenseTitle}
      cornerAction={
        <FormIconSubmit
          type="button"
          variant="save"
          label={pending ? messages.editExpenseSaving : messages.editExpenseSave}
          disabled={!canSubmit}
          onClick={() => void submit(undefined)}
        />
      }
      body={
        <div className="flex w-full flex-col gap-(--space-3)">
          <div className="flex flex-col gap-1">
            <label className="text-[0.8rem] text-muted" htmlFor={`${baseId}-amount`}>
              {messages.expenseAmount}
            </label>
            <input
              id={`${baseId}-amount`}
              className="min-w-0 font-inherit text-[0.9rem] bg-background border-2 border-border rounded-[8px] px-[0.65rem] py-2 text-foreground outline-none"
              inputMode="decimal"
              value={amount}
              disabled={pending}
              onChange={(e) => {
                setAmount(e.target.value);
                clearError();
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[0.8rem] text-muted" htmlFor={`${baseId}-description`}>
              {messages.expenseDescription}
            </label>
            <input
              id={`${baseId}-description`}
              className="min-w-0 font-inherit text-[0.9rem] bg-background border-2 border-border rounded-[8px] px-[0.65rem] py-2 text-foreground outline-none"
              maxLength={500}
              value={description}
              disabled={pending}
              onChange={(e) => {
                setDescription(e.target.value);
                clearError();
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[0.8rem] text-muted" htmlFor={`${baseId}-date`}>
              {messages.editExpenseDateLabel}
            </label>
            <input
              id={`${baseId}-date`}
              type="date"
              className="min-w-0 font-inherit text-[0.9rem] bg-background border-2 border-border rounded-[8px] px-[0.65rem] py-2 text-foreground outline-none"
              value={postedDate}
              disabled={pending}
              onChange={(e) => {
                setPostedDate(e.target.value);
                clearError();
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[0.8rem] text-muted" id={`${baseId}-payer-label`}>
              {messages.expensePayer}
            </span>
            <SoftLedgerSelect
              id={`${baseId}-payer`}
              value={activePayerId}
              options={memberOptions}
              disabled={pending}
              aria-labelledby={`${baseId}-payer-label`}
              onChange={(next) => {
                setPayerId(next);
                clearError();
              }}
            />
          </div>

          {members.length > 1 ? (
            <div className="flex flex-col gap-(--space-2)">
              <TriSwitch
                aria-label={messages.expenseAdjustSplit}
                value={mode}
                disabled={pending}
                onChange={(next) => {
                  setMode(next);
                  clearError();
                  if (next === "percentage") setPercentages(evenPercentMap(members));
                }}
                options={[
                  { value: "whole_assignee", label: messages.expenseModeWhole, icon: <UserIcon /> },
                  {
                    value: "percentage",
                    label: messages.expenseModePercentage,
                    icon: <PercentageIcon />,
                  },
                  {
                    value: "absolute_amounts",
                    label: messages.expenseModeAbsolute,
                    icon: <HashtagIcon />,
                  },
                ]}
              />

              {mode === "whole_assignee" ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[0.8rem] text-muted" id={`${baseId}-assignee-label`}>
                    {messages.expenseAssignee}
                  </span>
                  <SoftLedgerSelect
                    id={`${baseId}-assignee`}
                    value={activeAssigneeId}
                    options={memberOptions}
                    disabled={pending}
                    aria-labelledby={`${baseId}-assignee-label`}
                    onChange={setAssigneeId}
                  />
                </div>
              ) : null}

              {mode === "percentage" ? (
                <PercentageSplitTrack
                  userIds={members.map((m) => m.user_id)}
                  currentUserId={currentUserId}
                  members={members}
                  percents={percentages}
                  onChangePercents={setPercentages}
                  disabled={pending}
                  defaultPercents={evenPercentMap(members)}
                />
              ) : null}

              {mode === "absolute_amounts" ? (
                <div className="flex flex-col gap-2">
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between gap-2">
                      <label className="text-[0.85rem] text-foreground" htmlFor={`${baseId}-abs-${m.user_id}`}>
                        {memberLabel(m)}
                      </label>
                      <input
                        id={`${baseId}-abs-${m.user_id}`}
                        className="min-w-0 w-24 font-inherit text-[0.9rem] bg-background border-2 border-border rounded-[8px] px-[0.5rem] py-1 text-foreground outline-none"
                        inputMode="decimal"
                        value={absoluteAmounts[m.user_id] ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          setAbsoluteAmounts((prev) => ({ ...prev, [m.user_id]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className="m-0 text-[0.85rem] text-owe" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      }
    />
  );
}
