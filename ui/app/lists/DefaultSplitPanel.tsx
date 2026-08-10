"use client";

import { useMemo, useRef, useState, useTransition } from "react";

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

type SliderProps = {
  userIds: string[];
  members: ListMember[];
  percents: Record<string, string>;
  onChangePercents: (newPercents: Record<string, string>) => void;
  disabled: boolean;
};

function PercentageSlider({ userIds, members, percents, onChangePercents, disabled }: SliderProps) {
  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) {
      map.set(member.user_id, member.alias || member.user_id);
    }
    return map;
  }, [members]);
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggedHandleIndex, setDraggedHandleIndex] = useState<number | null>(null);
  const [tooltipX, setTooltipX] = useState(0);

  const handleCount = userIds.length - 1;
  const percentValues = useMemo(() => {
    return userIds.map((id) => Number(percents[id]) || 0);
  }, [userIds, percents]);

  const handleMouseDown = (index: number) => (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setDraggedHandleIndex(index);
  };

  const handleTouchStart = (index: number) => (e: React.TouchEvent) => {
    if (disabled) return;
    setDraggedHandleIndex(index);
  };

  const handleMouseUp = () => {
    setDraggedHandleIndex(null);
  };

  const handleTouchEnd = () => {
    setDraggedHandleIndex(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedHandleIndex === null || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    updateHandlePosition(draggedHandleIndex, percent);
    setTooltipX(percent);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggedHandleIndex === null || !trackRef.current) return;
    e.preventDefault();

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    updateHandlePosition(draggedHandleIndex, percent);
    setTooltipX(percent);
  };

  const handleKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const direction = e.key === "ArrowLeft" ? -1 : 1;
      const currentPos = percentValues.slice(0, index + 1).reduce((a, b) => a + b, 0);
      const newPos = Math.max(0, Math.min(100, currentPos + direction * step));
      updateHandlePosition(index, newPos);
    }
  };

  const updateHandlePosition = (handleIndex: number, handlePositionPercent: number) => {
    const newValues = [...percentValues];
    const leftSum = percentValues.slice(0, handleIndex).reduce((a, b) => a + b, 0);
    const rightSum = percentValues.slice(handleIndex + 2).reduce((a, b) => a + b, 0);

    const minPos = leftSum;
    const maxPos = 100 - rightSum;
    const clampedPos = Math.max(minPos, Math.min(maxPos, handlePositionPercent));

    newValues[handleIndex] = clampedPos - leftSum;
    newValues[handleIndex + 1] = 100 - clampedPos - rightSum;

    const updated: Record<string, string> = {};
    userIds.forEach((id, i) => {
      updated[id] = Math.max(0, Math.round(newValues[i] * 100) / 100).toString();
    });

    onChangePercents(updated);
  };

  const handleSegmentTap = (index: number) => {
    if (disabled || index >= handleCount) return;
    const handleElement = trackRef.current?.querySelector(
      `[data-handle="${index}"]`
    ) as HTMLDivElement | null;
    handleElement?.focus();
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    if (disabled || draggedHandleIndex !== null) return;
    if (!trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    let closestHandleIndex = 0;
    let closestDistance = Math.abs(percentValues.slice(0, 1).reduce((a, b) => a + b, 0) - clickPercent);

    for (let i = 0; i < handleCount; i++) {
      const handlePos = percentValues.slice(0, i + 1).reduce((a, b) => a + b, 0);
      const distance = Math.abs(handlePos - clickPercent);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestHandleIndex = i;
      }
    }

    updateHandlePosition(closestHandleIndex, clickPercent);
  };

  return (
    <div className={styles.sliderContainer}>
      <div
        ref={trackRef}
        className={styles.sliderTrack}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTrackClick}
        role="group"
        aria-label="Percentage split slider"
      >
        {userIds.map((userId, i) => (
          <div
            key={userId}
            className={styles.sliderSegment}
            onClick={() => handleSegmentTap(i)}
          >
            {Math.round(percentValues[i])}%
          </div>
        ))}

        {Array.from({ length: handleCount }).map((_, i) => {
          const leftSum = percentValues.slice(0, i + 1).reduce((a, b) => a + b, 0);
          const position = leftSum;

          return (
            <div
              key={`handle-${i}`}
              data-handle={i}
              className={styles.sliderHandle}
              style={{
                left: `${position}%`,
              }}
              onMouseDown={handleMouseDown(i)}
              onTouchStart={handleTouchStart(i)}
              onKeyDown={handleKeyDown(i)}
              role="slider"
              aria-label={`${userIds[i]} percentage`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percentValues[i])}
              aria-valuetext={`${Math.round(percentValues[i])}%`}
              tabIndex={0}
            />
          );
        })}

        {draggedHandleIndex !== null && (
          <div
            className={styles.sliderTooltip}
            style={{
              left: `${tooltipX}%`,
            }}
          >
            {memberMap.get(userIds[draggedHandleIndex]) || userIds[draggedHandleIndex]}: {Math.round(percentValues[draggedHandleIndex])}% |{" "}
            {memberMap.get(userIds[draggedHandleIndex + 1]) || userIds[draggedHandleIndex + 1]}: {Math.round(percentValues[draggedHandleIndex + 1])}%
          </div>
        )}
      </div>

      <div className={styles.sliderLabels}>
        {userIds.map((userId) => (
          <div key={`label-${userId}`} className={styles.sliderLabel}>
            {memberMap.get(userId) || userId.slice(0, 8)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DefaultSplitPanel({ listId, isOwner, initial, members, messages }: Props) {
  const [mode, setMode] = useState<"even" | "percentage">(initial.mode);
  const savedPercents = useMemo(() => getInitialSavedPercents(initial), [initial]);
  const [percents, setPercents] = useState<Record<string, string>>(() => getInitialSavedPercents(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sum = useMemo(() => sumPercents(percents), [percents]);
  const sumOk = mode === "even" || sum === 100;
  const hasChanged = useMemo(
    () => hasChanges(percents, savedPercents),
    [percents, savedPercents]
  );

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
                  setPercents(map);
                }
              });
            }}
          />
          {messages.defaultSplitCustom}
        </label>
      </div>
      {mode === "percentage" && initial.member_ids.length > 1 ? (
        <>
          <PercentageSlider
            userIds={initial.member_ids}
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
      <button
        type="button"
        className={styles.primary}
        disabled={pending || !sumOk || !hasChanged}
        onClick={onSave}
      >
        {pending ? messages.defaultSplitSaving : messages.defaultSplitSave}
      </button>
    </section>
  );
}
