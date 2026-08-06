"use client";

import { useMemo, useState, useTransition } from "react";

import {
  fetchDefaultSplit,
  saveDefaultSplit,
  type DefaultSplitPayload,
  type ListsClientMessages,
} from "./listsClient";
import styles from "./lists.module.css";

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

type Props = {
  listId: string;
  isOwner: boolean;
  initial: DefaultSplitPayload;
  messages: DefaultSplitMessages;
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

export function DefaultSplitPanel({ listId, isOwner, initial, messages }: Props) {
  const [mode, setMode] = useState<"even" | "percentage">(initial.mode);
  const [percents, setPercents] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const share of initial.shares) {
      map[share.user_id] = share.percentage;
    }
    for (const id of initial.member_ids) {
      if (!(id in map)) map[id] = "0";
    }
    return map;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sum = useMemo(() => sumPercents(percents), [percents]);
  const sumOk = mode === "even" || sum === 100;

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
            : initial.shares
                .map((s) => `${s.percentage}%`)
                .join(" / ")}
        </p>
      </section>
    );
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
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
      const result = await saveDefaultSplit(listId, body, {
        ...messages,
        errorInvalidName: messages.errorInvalidSplit,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode(result.split.mode);
      const next: Record<string, string> = {};
      for (const share of result.split.shares) {
        next[share.user_id] = share.percentage;
      }
      setPercents(next);
    });
  }

  return (
    <section className={styles.detailSection} aria-labelledby="default-split-heading">
      <h2 id="default-split-heading" className={styles.sectionTitle}>
        {messages.defaultSplitTitle}
      </h2>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.splitModeRow} role="group" aria-label={messages.defaultSplitTitle}>
        <label className={styles.splitModeOption}>
          <input
            type="radio"
            name="default-split-mode"
            checked={mode === "even"}
            disabled={pending}
            onChange={() => setMode("even")}
          />
          {messages.defaultSplitEven}
        </label>
        <label className={styles.splitModeOption}>
          <input
            type="radio"
            name="default-split-mode"
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
                  setPercents((prev) => ({ ...map, ...prev }));
                }
              });
            }}
          />
          {messages.defaultSplitCustom}
        </label>
      </div>
      {mode === "percentage" ? (
        <div className={styles.splitShares}>
          {Object.keys(percents).map((userId) => (
            <label key={userId} className={styles.label}>
              <span className={styles.splitMemberId}>{userId.slice(0, 8)}…</span>
              <input
                className={styles.input}
                inputMode="decimal"
                value={percents[userId] ?? ""}
                disabled={pending}
                onChange={(e) =>
                  setPercents((prev) => ({ ...prev, [userId]: e.target.value }))
                }
                aria-label={`Percentage ${userId}`}
              />
            </label>
          ))}
          <p className={styles.splitSum}>
            {messages.defaultSplitSum}: {Number.isFinite(sum) ? sum : "—"}
            {sumOk ? "" : " ≠ 100"}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        className={styles.primary}
        disabled={pending || !sumOk}
        onClick={onSave}
      >
        {pending ? messages.defaultSplitSaving : messages.defaultSplitSave}
      </button>
    </section>
  );
}
