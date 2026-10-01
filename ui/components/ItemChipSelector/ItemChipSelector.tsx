"use client";

import { useRef, useState } from "react";

import { Chip, chipClassName } from "@/components/Chip";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SpinnerIcon } from "@/app/icons";
import { Sheet } from "@/app/lists/Sheet";

export type ItemChipSelectorMode = "single" | "multiple";

type Props = {
  /** Available options (each label must be unique) */
  labels: string[];
  /** Selection mode */
  mode: ItemChipSelectorMode;
  /** Callback when user confirms selection. Can be async for API calls. */
  onChange: (selected: string[]) => void | Promise<void>;
  /** Currently selected value (for single) or values (for multiple) */
  defaultLabel: string | string[];
  /** Label for the trigger button */
  triggerLabel: string;
  /** Label for the confirm action button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel: string;
  /** Label for the sheet title/dialog heading */
  sheetTitle: string;
  /** Whether the component is disabled */
  disabled?: boolean;
};

/**
 * Generic single/multi-select chip picker that opens a Sheet dialog.
 * In single-select mode, the current selection is hidden from the options.
 * Supports async onChange for API calls with loading state.
 */
export function ItemChipSelector({
  labels,
  mode,
  onChange,
  defaultLabel,
  triggerLabel,
  confirmLabel = "Move",
  cancelLabel,
  sheetTitle,
  disabled = false,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(
    mode === "single" ? [defaultLabel as string] : (defaultLabel as string[])
  );
  const [busy, setBusy] = useState(false);

  const getDisplayLabels = () => {
    if (mode === "single") {
      // Single select: show all except current
      return labels.filter((label) => label !== selected[0]);
    }
    // Multiple: show all
    return labels;
  };

  const handleToggle = (label: string) => {
    if (mode === "single") {
      setSelected([label]);
    } else {
      setSelected((prev) =>
        prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
      );
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onChange(selected);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = () => {
    // Reset to default on cancel
    setSelected(
      mode === "single" ? [defaultLabel as string] : (defaultLabel as string[])
    );
    setOpen(false);
  };

  const displayLabels = getDisplayLabels();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-sm font-medium hover:bg-surface/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {triggerLabel}
      </button>

      <Sheet
        open={open}
        onClose={handleCancel}
        closeLabel={cancelLabel}
        title={sheetTitle}
        returnFocusRef={triggerRef}
        body={
          busy ? (
            <div className="flex items-center justify-center py-8">
              <SpinnerIcon className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {displayLabels.map((label) => {
                const isSelected = selected.includes(label);
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleToggle(label)}
                    disabled={busy}
                    className={`${chipClassName.accent} cursor-pointer hover:bg-accent/10 transition-colors ${
                      isSelected ? "ring-2 ring-accent ring-offset-1" : ""
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )
        }
        footer={
          <div className="flex justify-end gap-[var(--space-2)]">
            <GhostButton onClick={handleCancel} disabled={busy}>
              {cancelLabel}
            </GhostButton>
            <PrimaryButton
              onClick={handleConfirm}
              disabled={busy || selected.length === 0}
              loading={busy}
            >
              {confirmLabel}
            </PrimaryButton>
          </div>
        }
      />
    </>
  );
}
