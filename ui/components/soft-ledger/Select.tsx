"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import styles from "./Select.module.css";

export type SoftLedgerSelectOption = {
  value: string;
  label: string;
};

type SoftLedgerSelectProps = {
  id?: string;
  name?: string;
  value: string;
  options: SoftLedgerSelectOption[];
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  onChange: (value: string) => void;
};

/** Soft-Ledger listbox select — kit-bound open/closed surface; never native OS menu. */
export function SoftLedgerSelect({
  id,
  name,
  value,
  options,
  disabled = false,
  required = false,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  onChange,
}: SoftLedgerSelectProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const triggerId = id ?? `${reactId}-trigger`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value) ?? options[0];
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === (selected?.value ?? "")),
  );

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        close();
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  function choose(next: string) {
    onChange(next);
    close();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = options[Math.min(selectedIndex + 1, options.length - 1)];
      if (next) onChange(next.value);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = options[Math.max(selectedIndex - 1, 0)];
      if (prev) onChange(prev.value);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      close();
    }
  }

  return (
    <div className={styles.root} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        id={triggerId}
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      {open ? (
        <ul
          id={listboxId}
          className={styles.listbox}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listboxId}-opt-${selectedIndex}`}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                className={isSelected ? `${styles.option} ${styles.optionSelected}` : styles.option}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option.value);
                }}
              >
                {option.label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
