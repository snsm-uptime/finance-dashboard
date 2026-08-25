"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useFormSubmission, useFormStateSync } from "@/hooks";
import { HashtagIcon, PercentageIcon, UserIcon } from "@/app/icons";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { FormIconSubmit } from "@/components/FormIconSubmit";
import { TriSwitch } from "@/components/TriSwitch";

import { fetchCards, type CardItem } from "../cards/cardsClient";
import { PercentageSplitTrack } from "./PercentageSplitTrack";
import {
  createExpense,
  memberLabel,
  type CreateExpenseBody,
  type DefaultSplitPayload,
  type ListMember,
  type ListsClientMessages,
} from "./listsClient";
import styles from "./ManualExpenseForm.module.scss";

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
  expenseOriginLabel: string;
  expenseOriginBlank: string;
  expenseOriginCash: string;
};

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  defaultSplit?: DefaultSplitPayload | null;
  messages: ManualExpenseMessages;
  /** Callback fired when expense is successfully created */
  onSuccess?: () => void;
  /** Ref to form element for button submission */
  formRef?: React.RefObject<HTMLFormElement | null>;
  /** Callback to update button disabled state (called with canSubmit value) */
  onCanSubmitChange?: (canSubmit: boolean) => void;
};

type SplitMode = "whole_assignee" | "absolute_amounts" | "percentage";

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

function percentMapFromDefault(
  list: ListMember[],
  defaultSplit: DefaultSplitPayload | null | undefined,
): Record<string, string> {
  if (!defaultSplit || defaultSplit.shares.length === 0) {
    return evenPercentMap(list);
  }
  const byId = Object.fromEntries(
    defaultSplit.shares.map((share) => [share.user_id, share.percentage]),
  );
  const map: Record<string, string> = {};
  for (const member of list) {
    map[member.user_id] = byId[member.user_id] ?? "0";
  }
  return map;
}

function percentMapsEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (Number(left[key] || 0) !== Number(right[key] || 0)) return false;
  }
  return true;
}

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

/** Manual expense form (Story 3.2) with optional origin (card / Cash / blank, Story 4.2). */
export function ManualExpenseForm({
  listId,
  currentUserId,
  members,
  defaultSplit = null,
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
  const [originValue, setOriginValue] = useState("");
  const [cards, setCards] = useState<CardItem[]>([]);
  const [mode, setMode] = useState<SplitMode>("percentage");
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [absoluteAmounts, setAbsoluteAmounts] = useState<Record<string, string>>(() =>
    emptyMemberMap(members),
  );
  const [percentages, setPercentages] = useState<Record<string, string>>(() =>
    percentMapFromDefault(members, defaultSplit),
  );

  // SoftLedgerSelect no longer falls back to the first option for an
  // unmatched value (it renders unselected instead) — derive a
  // membership-valid value so payer/assignee never silently target the
  // wrong member if `members` is ever missing the current selection.
  const activePayerId = useMemo(
    () => (members.some((m) => m.user_id === payerId) ? payerId : ""),
    [members, payerId],
  );
  const activeAssigneeId = useMemo(
    () => (members.some((m) => m.user_id === assigneeId) ? assigneeId : ""),
    [members, assigneeId],
  );

  useEffect(() => {
    let cancelled = false;
    // Origin is optional — a failed card fetch just narrows the dropdown to
    // blank/Cash; it must not block the rest of the form.
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

  function resetAdjustFields() {
    setMode("percentage");
    setAssigneeId(currentUserId);
    setAbsoluteAmounts(emptyMemberMap(members));
    setPercentages(percentMapFromDefault(members, defaultSplit));
  }

  function buildSplitOverride():
    | { ok: true; value: CreateExpenseBody["split_override"] | undefined }
    | { ok: false; error: string } {
    if (mode === "whole_assignee") {
      return { ok: true, value: { kind: "whole_assignee", assignee_id: activeAssigneeId } };
    }
    if (mode === "absolute_amounts") {
      const amounts = nonEmptyEntries(absoluteAmounts);
      if (!amounts) {
        return { ok: false, error: messages.errorGeneric };
      }
      return { ok: true, value: { kind: "absolute_amounts", amounts } };
    }
    const baseline = percentMapFromDefault(members, defaultSplit);
    if (percentMapsEqual(percentages, baseline)) {
      return { ok: true, value: undefined };
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
        setOriginValue("");
        resetAdjustFields();
        router.refresh();
        onSuccess?.();
      },
    }
  );

  const canSubmit =
    amount.trim().length > 0 &&
    description.trim().length > 0 &&
    !!activePayerId &&
    (mode !== "whole_assignee" || !!activeAssigneeId) &&
    !pending;

  useFormStateSync(canSubmit, onCanSubmitChange);

  function originFields(): Pick<CreateExpenseBody, "origin_kind" | "origin_card_id"> {
    if (originValue === "") return { origin_kind: null, origin_card_id: null };
    if (originValue === "cash") return { origin_kind: "cash", origin_card_id: null };
    return { origin_kind: "card", origin_card_id: originValue };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePayerId) return;
    if (mode === "whole_assignee" && !activeAssigneeId) return;
    await submit({
      amount: amount.trim(),
      currency: "CRC",
      description: description.trim(),
      payer_id: activePayerId,
      split_override: undefined,
      ...originFields(),
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
            value={activePayerId}
            options={memberOptions}
            disabled={pending}
            aria-labelledby={`${baseId}-payer-label`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(next) => {
              setPayerId(next);
              // Origin belongs to the payer — clear any selection made while a
              // different payer was picked so it can't leak back in on reselect.
              if (next !== currentUserId) setOriginValue("");
              clearError();
            }}
          />
        </div>

        {activePayerId === currentUserId ? (
          <div className={styles.field}>
            <span className={styles.label} id={`${baseId}-origin-label`}>
              {messages.expenseOriginLabel}
            </span>
            <SoftLedgerSelect
              id={`${baseId}-origin`}
              name="origin"
              value={originValue}
              options={[
                { value: "", label: messages.expenseOriginBlank },
                { value: "cash", label: messages.expenseOriginCash },
                ...cards.map((c) => ({ value: c.id, label: c.label })),
              ]}
              disabled={pending}
              aria-labelledby={`${baseId}-origin-label`}
              onChange={setOriginValue}
            />
          </div>
        ) : null}

        <div className={styles.splitBlock}>
          <TriSwitch
            aria-label={messages.expenseAdjustSplit}
            value={mode}
            disabled={pending}
            onChange={(next) => {
              setMode(next);
              clearError();
              if (next === "percentage") {
                setPercentages(percentMapFromDefault(members, defaultSplit));
              }
            }}
            options={[
              {
                value: "whole_assignee",
                label: messages.expenseModeWhole,
                icon: <UserIcon />,
              },
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
            <div className={styles.field}>
              <span className={styles.label} id={`${baseId}-assignee-label`}>
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
              members={members}
              percents={percentages}
              onChangePercents={setPercentages}
              disabled={pending}
            />
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
        </div>

        {error ? (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        ) : null}

        {/* Callers that manage submission externally (e.g. mobile Sheet corner action) pass
            formRef and render their own button; otherwise fall back to this inline control. */}
        {!formRef ? (
          <div className={styles.submitRow}>
            <FormIconSubmit
              type="submit"
              variant="save"
              fill
              label={pending ? messages.expenseSaving : messages.expenseSubmit}
              disabled={!canSubmit}
            />
          </div>
        ) : null}
      </form>
    </section>
  );
}
