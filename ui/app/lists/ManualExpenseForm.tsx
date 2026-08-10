"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";

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
  showMobileActions?: boolean;
};

type SplitMode = "whole_assignee" | "absolute_amounts" | "percentage";

function emptyMemberMap(members: ListMember[]): Record<string, string> {
  return Object.fromEntries(members.map((m) => [m.user_id, ""]));
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
  showMobileActions = false,
}: Props) {
  const router = useRouter();
  const baseId = useId();
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
    emptyMemberMap(members),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  function resetAdjustFields() {
    setAdjustOpen(false);
    setMode("whole_assignee");
    setAssigneeId(currentUserId);
    setAbsoluteAmounts(emptyMemberMap(members));
    setPercentages(emptyMemberMap(members));
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setPending(true);
    try {
      const override = buildSplitOverride();
      if (!override.ok) {
        setError(override.error);
        return;
      }
      const body: CreateExpenseBody = {
        amount: amount.trim(),
        currency: "CRC",
        description: description.trim(),
        payer_id: payerId,
        split_override: override.value,
      };
      const result = await createExpense(listId, body, messages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAmount("");
      setDescription("");
      setPayerId(currentUserId);
      resetAdjustFields();
      router.refresh();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section aria-labelledby={`${baseId}-heading`}>
      <h2 id={`${baseId}-heading`} className={styles.heading}>
        {messages.expenseTitle}
      </h2>
      <form className={styles.form} onSubmit={onSubmit}>
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
              setError(null);
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
              setError(null);
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
              setError(null);
            }}
          />
        </div>

        {/* Origin extension point (Story 4.2): card / Cash / blank — do not ship a stub control. */}

        <details
          className={styles.adjust}
          open={adjustOpen}
          onToggle={(e) => {
            setAdjustOpen((e.target as HTMLDetailsElement).open);
            setError(null);
          }}
        >
          <summary className={styles.adjustSummary}>{messages.expenseAdjustSplit}</summary>
          <div className={styles.adjustBody} id={`${baseId}-adjust-panel`}>
            <div className={styles.modeRow} role="radiogroup" aria-label={messages.expenseAdjustSplit}>
              <label className={styles.modeOption}>
                <input
                  type="radio"
                  name="split-mode"
                  checked={mode === "whole_assignee"}
                  disabled={pending}
                  onChange={() => setMode("whole_assignee")}
                />
                {messages.expenseModeWhole}
              </label>
              <label className={styles.modeOption}>
                <input
                  type="radio"
                  name="split-mode"
                  checked={mode === "absolute_amounts"}
                  disabled={pending}
                  onChange={() => setMode("absolute_amounts")}
                />
                {messages.expenseModeAbsolute}
              </label>
              <label className={styles.modeOption}>
                <input
                  type="radio"
                  name="split-mode"
                  checked={mode === "percentage"}
                  disabled={pending}
                  onChange={() => setMode("percentage")}
                />
                {messages.expenseModePercentage}
              </label>
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
              <div className={styles.memberGrid}>
                {members.map((m) => (
                  <div key={m.user_id} className={styles.memberRow}>
                    <label className={styles.label} htmlFor={`${baseId}-pct-${m.user_id}`}>
                      {memberLabel(m)}
                    </label>
                    <input
                      id={`${baseId}-pct-${m.user_id}`}
                      className={styles.input}
                      inputMode="decimal"
                      value={percentages[m.user_id] ?? ""}
                      disabled={pending}
                      onChange={(e) =>
                        setPercentages((prev) => ({
                          ...prev,
                          [m.user_id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </details>

        {error ? (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        <div className={styles.actions}>
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? messages.expenseSaving : messages.expenseSubmit}
          </PrimaryButton>
        </div>

        {showMobileActions && (
          <>
            <div className={styles.divider} />

            <div className={styles.mobileActions}>
              <button
                type="button"
                className={styles.actionButton}
                aria-label="Share"
                disabled={pending}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
                  <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                  <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M8.59 13.51L15.41 17.49" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M15.41 6.51L8.59 10.49" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>

              <button
                type="button"
                className={styles.actionButton}
                aria-label={messages.expenseAdjustSplit}
                disabled={pending}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
                  <path d="M 12 12 L 12 2 A 10 10 0 0 1 15.09 21.51 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M 12 12 L 15.09 21.51 A 10 10 0 0 1 6.12 3.91 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M 12 12 L 6.12 3.91 A 10 10 0 0 1 12 2 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
