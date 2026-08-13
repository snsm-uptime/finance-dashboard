"use client";

import { useEffect, useMemo, useState } from "react";

import { useFormSubmission, useFormStateSync } from "@/hooks";
import { SoftLedgerRadio } from "@/components/soft-ledger/Radio";

import { PercentageSplitTrack } from "./PercentageSplitTrack";
import {
  fetchDefaultSplit,
  saveDefaultSplit,
  type DefaultSplitPayload,
  type ListsClientMessages,
} from "./listsClient";
import styles from "./lists.module.scss";

export type DefaultSplitMessages = ListsClientMessages & {
  defaultSplitTitle: string;
  defaultSplitEven: string;
  defaultSplitCustom: string;
  defaultSplitSum: string;
  defaultSplitSave: string;
  defaultSplitSaving: string;
  defaultSplitReadOnly: string;
  errorInvalidSplit: string;
};

type ListMember = {
  user_id: string;
  alias: string | null;
};

type Props = {
  listId: string;
  isOwner: boolean;
  initial: DefaultSplitPayload;
  members: ListMember[];
  messages: DefaultSplitMessages;
  /** Callback fired when default split is successfully saved */
  onSuccess?: () => void;
  /** Callback that receives the save function (called once to register save handler) */
  onSaveRequest?: (saveHandler: () => void) => void;
  /** Callback to update button disabled state (called with canSave value) */
  onCanSaveChange?: (canSave: boolean) => void;
};

function sumPercents(values: Record<string, string>): number {
  let total = 0;
  for (const raw of Object.values(values)) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return Number.NaN;
    total += n;
  }
  // Avoid float display noise for UI gate only — server is SoT.
  return Math.round(total * 10000) / 10000;
}

function getInitialSavedPercents(initial: DefaultSplitPayload): Record<string, string> {
  const map: Record<string, string> = {};
  for (const share of initial.shares) {
    map[share.user_id] = share.percentage;
  }
  for (const id of initial.member_ids) {
    if (!(id in map)) map[id] = "0";
  }
  return map;
}

function hasChanges(current: Record<string, string>, saved: Record<string, string>): boolean {
  const currentIds = Object.keys(current).sort();
  const savedIds = Object.keys(saved).sort();

  if (currentIds.length !== savedIds.length) return true;
  if (currentIds.join(",") !== savedIds.join(",")) return true;

  for (const id of currentIds) {
    const currentVal = Math.round(Number(current[id] || 0) * 100) / 100;
    const savedVal = Math.round(Number(saved[id] || 0) * 100) / 100;
    if (currentVal !== savedVal) return true;
  }
  return false;
}

export function DefaultSplitPanel({ listId, isOwner, initial, members, messages, onSuccess, onSaveRequest, onCanSaveChange }: Props) {
  const [mode, setMode] = useState<"even" | "percentage">(initial.mode);
  const [savedMode, setSavedMode] = useState<"even" | "percentage">(initial.mode);
  const initialPercents = useMemo(() => getInitialSavedPercents(initial), [initial]);
  const [percents, setPercents] = useState<Record<string, string>>(() => initialPercents);
  const [savedPercents, setSavedPercents] = useState<Record<string, string>>(initialPercents);

  const { pending, error, submit } = useFormSubmission(
    async (
      body: { mode: "even" } | { mode: "percentage"; shares: Array<{ user_id: string; percentage: string }> }
    ) => {
      const result = await saveDefaultSplit(
        listId,
        body as Parameters<typeof saveDefaultSplit>[1],
        {
          ...messages,
          errorInvalidName: messages.errorInvalidSplit,
        }
      );
      if (result.ok) {
        setMode(result.split.mode);
        setSavedMode(result.split.mode);
        const next: Record<string, string> = {};
        for (const share of result.split.shares) {
          next[share.user_id] = share.percentage;
        }
        setPercents(next);
        setSavedPercents(next);
      }
      return result;
    },
    { onSuccess }
  );

  const userIds = useMemo(() => {
    if (initial.member_ids.length > 0) return initial.member_ids;
    return members.map((m) => m.user_id);
  }, [initial.member_ids, members]);

  const sum = useMemo(() => sumPercents(percents), [percents]);
  const sumOk = mode === "even" || sum === 100;
  const hasChanged = useMemo(() => {
    if (mode !== savedMode) return true;
    if (mode === "even") return false;
    return hasChanges(percents, savedPercents);
  }, [mode, savedMode, percents, savedPercents]);
  const canSave = hasChanged && sumOk && !pending;

  async function onSave() {
    const body =
      mode === "even"
        ? { mode: "even" as const }
        : {
            mode: "percentage" as const,
            shares: Object.entries(percents).map(([user_id, percentage]) => ({
              user_id,
              percentage,
            })),
          };
    await submit(body);
  }

  useFormStateSync(canSave, onCanSaveChange);

  useEffect(() => {
    if (isOwner) {
      onSaveRequest?.(() => {
        if (canSave) {
          onSave();
        }
      });
    }
  }, [isOwner, canSave, onSaveRequest, onSave]);

  if (!isOwner) {
    return (
      <section className={styles.detailSection} aria-labelledby="default-split-heading">
        <h2 id="default-split-heading" className={styles.sectionTitle}>
          {messages.defaultSplitTitle}
        </h2>
        <p className={styles.copy}>{messages.defaultSplitReadOnly}</p>
        <p className={styles.copy}>
          {initial.mode === "even"
            ? messages.defaultSplitEven
            : initial.shares.map((s) => `${s.percentage}%`).join(" / ")}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.detailSection} aria-labelledby="default-split-heading">
      <h2 id="default-split-heading" className={styles.sectionTitle}>
        {messages.defaultSplitTitle}
      </h2>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.splitModeRow} role="radiogroup" aria-label={messages.defaultSplitTitle}>
        <SoftLedgerRadio
          className={styles.splitModeOption}
          name="default-split-mode"
          value="even"
          checked={mode === "even"}
          disabled={pending}
          onChange={() => setMode("even")}
        >
          {messages.defaultSplitEven}
        </SoftLedgerRadio>
        <SoftLedgerRadio
          className={styles.splitModeOption}
          name="default-split-mode"
          value="percentage"
          checked={mode === "percentage"}
          disabled={pending}
          onChange={() => {
            setMode("percentage");
            // Refresh even baselines when switching to custom if empty.
            void fetchDefaultSplit(listId, messages).then((res) => {
              if (res.ok) {
                const map: Record<string, string> = {};
                for (const share of res.split.shares) {
                  map[share.user_id] = share.percentage;
                }
                setPercents(map);
              }
            });
          }}
        >
          {messages.defaultSplitCustom}
        </SoftLedgerRadio>
      </div>
      {mode === "percentage" && userIds.length > 1 ? (
        <>
          <PercentageSplitTrack
            userIds={userIds}
            members={members}
            percents={percents}
            onChangePercents={setPercents}
            disabled={pending}
          />
          <p className={styles.splitSum}>
            {messages.defaultSplitSum}: {Number.isFinite(sum) ? sum : "—"}
            {sumOk ? "" : " ≠ 100"}
          </p>
        </>
      ) : null}
    </section>
  );
}
