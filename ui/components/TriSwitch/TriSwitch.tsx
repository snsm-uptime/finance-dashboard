"use client";

import type { KeyboardEvent, ReactNode } from "react";

import styles from "./TriSwitch.module.scss";

export type TriSwitchOption<T extends string = string> = {
  value: T;
  /** Tooltip and accessible name for this option. */
  label: string;
  icon: ReactNode;
};

export type TriSwitchProps<T extends string = string> = {
  value: T;
  onChange: (value: T) => void;
  /** Left, middle (default path), right. */
  options: readonly [
    TriSwitchOption<T>,
    TriSwitchOption<T>,
    TriSwitchOption<T>,
  ];
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
};

/**
 * Three-position switch: a sliding square thumb marks the selected option.
 * Reuse for theme, placement, or a boolean with an explicit default/middle path.
 */
export function TriSwitch<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  "aria-label": ariaLabel,
  className,
}: TriSwitchProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const selected = options[selectedIndex] ?? options[1];

  function selectIndex(index: number) {
    if (disabled) return;
    const next = options[index];
    if (!next || next.value === value) return;
    onChange(next.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex(Math.min(2, selectedIndex + 1));
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectIndex(Math.max(0, selectedIndex - 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      selectIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectIndex(2);
    }
  }

  const rootClass = className ? `${styles.root} ${className}` : styles.root;

  return (
    <div
      className={rootClass}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-index={selectedIndex}
      onKeyDown={onKeyDown}
    >
      <div
        className={styles.thumb}
        aria-hidden="true"
        data-index={selectedIndex}
      >
        {selected.icon}
      </div>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={styles.option}
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            disabled={disabled}
            tabIndex={checked ? 0 : -1}
            onClick={() => selectIndex(index)}
          >
            <span className={styles.optionIcon}>{option.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
