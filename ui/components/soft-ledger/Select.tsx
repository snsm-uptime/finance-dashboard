"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { menuSurface } from "@/components/MenuSurface";

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
    <div className="relative w-full" ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        id={triggerId}
        className="flex items-center justify-between gap-2 w-full m-0 box-border px-[0.7rem] py-[0.55rem] border border-border rounded-sm bg-surface text-foreground text-left cursor-pointer font-semibold leading-[1.4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-55 disabled:cursor-not-allowed aria-invalid:border-[#b33]"
        style={{
          fontFamily: "var(--font-ui), system-ui, sans-serif",
          fontSize: "1rem",
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {selected?.label ?? ""}
        </span>
        <span
          className="flex-shrink-0"
          style={{
            width: "0.55rem",
            height: "0.55rem",
            borderRight: "2px solid rgba(var(--foreground), 0.55)",
            borderBottom: "2px solid rgba(var(--foreground), 0.55)",
            transform: "rotate(45deg) translateY(-0.15rem)",
          }}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul
          id={listboxId}
          className={`${menuSurface.panel} absolute z-20 top-[calc(100%_+_0.25rem)] left-0 right-0 m-0 p-1 list-none max-h-56`}
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
                className={`${menuSurface.item}${isSelected ? ` ${menuSurface.itemSelected}` : ""}`}
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
