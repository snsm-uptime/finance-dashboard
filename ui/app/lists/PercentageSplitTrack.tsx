"use client";

import { useMemo, useRef, useState } from "react";

import styles from "./PercentageSplitTrack.module.css";

export type PercentageSplitMember = {
  user_id: string;
  alias: string | null;
};

type Props = {
  userIds: string[];
  members: PercentageSplitMember[];
  percents: Record<string, string>;
  onChangePercents: (newPercents: Record<string, string>) => void;
  disabled?: boolean;
};

/**
 * Interactive percentage split track — drag handles between member segments.
 * Always keeps shares summing to 100.
 */
export function PercentageSplitTrack({
  userIds,
  members,
  percents,
  onChangePercents,
  disabled = false,
}: Props) {
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

  const handleTouchStart = (index: number) => () => {
    if (disabled) return;
    setDraggedHandleIndex(index);
  };

  const handleMouseUp = () => {
    setDraggedHandleIndex(null);
  };

  const handleTouchEnd = () => {
    setDraggedHandleIndex(null);
  };

  const updateHandlePosition = (handleIndex: number, handlePositionPercent: number) => {
    const newValues = [...percentValues];
    const leftSum = percentValues.slice(0, handleIndex).reduce((a, b) => a + b, 0);
    const rightSum = percentValues.slice(handleIndex + 2).reduce((a, b) => a + b, 0);

    // Whole-percentage steps only — avoids float drift when shares must sum to 100.
    const minPos = Math.round(leftSum);
    const maxPos = Math.round(100 - rightSum);
    const clampedPos = Math.max(
      minPos,
      Math.min(maxPos, Math.round(handlePositionPercent)),
    );

    newValues[handleIndex] = clampedPos - minPos;
    newValues[handleIndex + 1] = maxPos - clampedPos;

    const updated: Record<string, string> = {};
    userIds.forEach((id, i) => {
      updated[id] = String(Math.max(0, Math.round(newValues[i])));
    });

    onChangePercents(updated);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedHandleIndex === null || !trackRef.current) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    const stepped = Math.round(percent);
    updateHandlePosition(draggedHandleIndex, stepped);
    setTooltipX(stepped);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggedHandleIndex === null || !trackRef.current) return;
    e.preventDefault();

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

    const stepped = Math.round(percent);
    updateHandlePosition(draggedHandleIndex, stepped);
    setTooltipX(stepped);
  };

  const handleKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 5 : 1;
      const direction = e.key === "ArrowLeft" ? -1 : 1;
      const currentPos = Math.round(
        percentValues.slice(0, index + 1).reduce((a, b) => a + b, 0),
      );
      const newPos = Math.max(0, Math.min(100, currentPos + direction * step));
      updateHandlePosition(index, newPos);
    }
  };

  const handleSegmentTap = (index: number) => {
    if (disabled || index >= handleCount) return;
    const handleElement = trackRef.current?.querySelector(
      `[data-handle="${index}"]`,
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
    let closestDistance = Math.abs(
      percentValues.slice(0, 1).reduce((a, b) => a + b, 0) - clickPercent,
    );

    for (let i = 0; i < handleCount; i++) {
      const handlePos = percentValues.slice(0, i + 1).reduce((a, b) => a + b, 0);
      const distance = Math.abs(handlePos - clickPercent);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestHandleIndex = i;
      }
    }

    updateHandlePosition(closestHandleIndex, Math.round(clickPercent));
  };

  if (userIds.length < 2) return null;

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
        aria-disabled={disabled || undefined}
      >
        {userIds.map((userId, i) => (
          <div
            key={userId}
            className={styles.sliderSegment}
            style={{
              width: `${Math.max(percentValues[i], 1)}%`,
            }}
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
              aria-label={`${memberMap.get(userIds[i]) || userIds[i]} percentage`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percentValues[i])}
              aria-valuetext={`${Math.round(percentValues[i])}%`}
              aria-disabled={disabled || undefined}
              tabIndex={disabled ? -1 : 0}
            />
          );
        })}

        {draggedHandleIndex !== null ? (
          <div
            className={styles.sliderTooltip}
            style={{
              left: `${tooltipX}%`,
            }}
          >
            {memberMap.get(userIds[draggedHandleIndex]) || userIds[draggedHandleIndex]}:{" "}
            {Math.round(percentValues[draggedHandleIndex])}% |{" "}
            {memberMap.get(userIds[draggedHandleIndex + 1]) ||
              userIds[draggedHandleIndex + 1]}
            : {Math.round(percentValues[draggedHandleIndex + 1])}%
          </div>
        ) : null}
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
