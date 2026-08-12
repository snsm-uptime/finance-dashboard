"use client";

import { FormEvent, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";

import { useFormSubmission } from "@/hooks";
import { SoftLedgerRadio } from "@/components/soft-ledger/Radio";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";

import { PercentageSplitTrack } from "./PercentageSplitTrack";
import {
  createExpense,
  memberLabel,
  type CreateExpenseBody,
  type ListMember,
  type ListsClientMessages,
} from "./listsClient";
import styles from "./ManualExpenseForm.module.css";

export type ManualExpenseMessages = ListsClientMessages & {
  expenseTitle: string;
  expenseAmount: string;
  expenseDescription: string;
  expensePayer: string;
  expenseSubmit: string;
  expenseSaving: string;
  expenseAdjustSplit: string;
  expenseModeWhole: string;
  expenseModeAbsolute: string;
  expenseModePercentage: string;
  expenseAssignee: string;
};

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  messages: ManualExpenseMessages;
  /** Callback fired when expense is successfully created */
  onSuccess?: () => void;
  /** Ref to form element for button submission */
  formRef?: React.RefObject<HTMLFormElement | null>;
  /** Callback to update button disabled state (called with canSubmit value) */
  onCanSubmitChange?: (canSubmit: boolean) => void;
};

type SplitMode = "whole_assignee" | "absolute_amounts" | "percentage";

function emptyMemberMap(members: ListMember[]): Record<string, string> {
  return Object.fromEntries(members.map((m) => [m.user_id, ""]));
}

function evenPercentMap(list: ListMember[]): Record<string, string> {
  if (list.length === 0) return {};
  const each = Math.floor(100 / list.length);
  const map: Record<string, string> = {};
  let allocated = 0;
  list.forEach((m, i) => {
    if (i === list.length - 1) {
      map[m.user_id] = String(100 - allocated);
    } else {
      map[m.user_id] = String(each);
      allocated += each;
    }
  });
  return map;
}

function nonEmptyEntries(map: Record<string, string>): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(map)) {
    const value = raw.trim();
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Manual expense form (Story 3.2).
 * Origin (card / Cash / blank) intentionally omitted — Story 4.2 extension point only.
 */
export function ManualExpenseForm({
  listId,
  currentUserId,
  members,
  messages,
  onSuccess,
  formRef,
  onCanSubmitChange,
}: Props) {
  const router = useRouter();
  const baseId = useId();
  const formId = `${baseId}-form`;
  const errorId = `${baseId}-error`;
  const memberOptions = members.map((m) => ({
    value: m.user_id,
    label: memberLabel(m),
  }));

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [payerId, setPayerId] = useState(currentUserId);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [mode, setMode] = useState<SplitMode>("whole_assignee");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [absoluteAmounts, setAbsoluteAmounts] = useState<Record<string, string>>(() =>
    emptyMemberMap(members),
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    evenPercentMap(members),
  );

  function resetAdjustFields() {
    setAdjustOpen(false);
    setMode("whole_assignee");
    setAssigneeId(currentUserId);
    setAbsoluteAmounts(emptyMemberMap(members));
    setPercentages(evenPercentMap(members));
  }

  function buildSplitOverride():
    | { ok: true; value: CreateExpenseBody["split_override"] | undefined }
    | { ok: false; error: string } {
    if (!adjustOpen) return { ok: true, value: undefined };
    if (mode === "whole_assignee") {
      return { ok: true, value: { kind: "whole_assignee", assignee_id: assigneeId } };
    }
    if (mode === "absolute_amounts") {
      const amounts = nonEmptyEntries(absoluteAmounts);
      if (!amounts) {
        return { ok: false, error: messages.errorGeneric };
      }
      return { ok: true, value: { kind: "absolute_amounts", amounts } };
    }
    const pct = nonEmptyEntries(percentages);
    if (!pct) {
      return { ok: false, error: messages.errorGeneric };
    }
    return { ok: true, value: { kind: "percentage", percentages: pct } };
  }

  const { pending, error, submit, clearError } = useFormSubmission(
    async (body: CreateExpenseBody) => {
      const override = buildSplitOverride();
      if (!override.ok) {
        return { ok: false, error: override.error };
      }
      const result = await createExpense(
        listId,
        { ...body, split_override: override.value },
        messages
      );
      return result;
    },
    {
      onSuccess: () => {
        setAmount("");
        setDescription("");
        setPayerId(currentUserId);
        resetAdjustFields();
        router.refresh();
        onSuccess?.();
      },
    }
  );

  const canSubmit =
    amount.trim().length > 0 && description.trim().length > 0 && !pending;

  useEffect(() => {
    onCanSubmitChange?.(canSubmit);
  }, [canSubmit, onCanSubmitChange]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit({
      amount: amount.trim(),
      currency: "CRC",
      description: description.trim(),
      payer_id: payerId,
      split_override: undefined,
    });
  }

  return (
    <section aria-labelledby={`${baseId}-heading`}>
      <h2 id={`${baseId}-heading`} className={styles.heading}>
        {messages.expenseTitle}
      </h2>
      <form ref={formRef} id={formId} className={styles.form} onSubmit={onSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${baseId}-amount`}>
            {messages.expenseAmount}
          </label>
          <input
            id={`${baseId}-amount`}
            className={styles.input}
            name="amount"
            inputMode="decimal"
            required
            value={amount}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setAmount(e.target.value);
              clearError();
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${baseId}-description`}>
            {messages.expenseDescription}
          </label>
          <input
            id={`${baseId}-description`}
            className={styles.input}
            name="description"
            required
            maxLength={500}
            value={description}
            disabled={pending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setDescription(e.target.value);
              clearError();
            }}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label} id={`${baseId}-payer-label`}>
            {messages.expensePayer}
          </span>
          <SoftLedgerSelect
            id={`${baseId}-payer`}
            name="payer_id"
            required
            value={payerId}
            options={memberOptions}
            disabled={pending}
            aria-labelledby={`${baseId}-payer-label`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(next) => {
              setPayerId(next);
              clearError();
            }}
          />
        </div>

        {/* Origin extension point (Story 4.2): card / Cash / blank — do not ship a stub control. */}

        <details
          className={styles.adjust}
          open={adjustOpen}
          onToggle={(e) => {
            setAdjustOpen((e.target as HTMLDetailsElement).open);
            clearError();
          }}
        >
          <summary className={styles.adjustSummary}>{messages.expenseAdjustSplit}</summary>
          <div className={styles.adjustBody} id={`${baseId}-adjust-panel`}>
            <div className={styles.modeRow} role="radiogroup" aria-label={messages.expenseAdjustSplit}>
              <SoftLedgerRadio
                className={styles.modeOption}
                name="split-mode"
                value="whole_assignee"
                checked={mode === "whole_assignee"}
                disabled={pending}
                onChange={() => setMode("whole_assignee")}
              >
                {messages.expenseModeWhole}
              </SoftLedgerRadio>
              <SoftLedgerRadio
                className={styles.modeOption}
                name="split-mode"
                value="absolute_amounts"
                checked={mode === "absolute_amounts"}
                disabled={pending}
                onChange={() => setMode("absolute_amounts")}
              >
                {messages.expenseModeAbsolute}
              </SoftLedgerRadio>
              <SoftLedgerRadio
                className={styles.modeOption}
                name="split-mode"
                value="percentage"
                checked={mode === "percentage"}
                disabled={pending}
                onChange={() => {
                  setMode("percentage");
                  setPercentages(evenPercentMap(members));
                }}
              >
                {messages.expenseModePercentage}
              </SoftLedgerRadio>
            </div>

            {mode === "whole_assignee" ? (
              <div className={styles.field}>
                <span className={styles.label} id={`${baseId}-assignee-label`}>
                  {messages.expenseAssignee}
                </span>
                <SoftLedgerSelect
                  id={`${baseId}-assignee`}
                  value={assigneeId}
                  options={memberOptions}
                  disabled={pending}
                  aria-labelledby={`${baseId}-assignee-label`}
                  onChange={setAssigneeId}
                />
              </div>
            ) : null}

            {mode === "absolute_amounts" ? (
              <div className={styles.memberGrid}>
                {members.map((m) => (
                  <div key={m.user_id} className={styles.memberRow}>
                    <label className={styles.label} htmlFor={`${baseId}-abs-${m.user_id}`}>
                      {memberLabel(m)}
                    </label>
                    <input
                      id={`${baseId}-abs-${m.user_id}`}
                      className={styles.input}
                      inputMode="decimal"
                      value={absoluteAmounts[m.user_id] ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        setAbsoluteAmounts((prev) => ({
                          ...prev,
                          [m.user_id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}

            {mode === "percentage" ? (
              <PercentageSplitTrack
                userIds={members.map((m) => m.user_id)}
                members={members}
                percents={percentages}
                onChangePercents={setPercentages}
                disabled={pending}
              />
            ) : null}
          </div>
        </details>

        {error ? (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </section>
  );
}
