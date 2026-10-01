"use client";

import { useRef, useState } from "react";

import { chipClassName } from "@/components/Chip";
import { ActionDialog } from "@/components/ActionDialog";
import { SpinnerIcon } from "@/app/icons";

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
  /** Label for the trigger button (omit to hide trigger and use controlled open state) */
  triggerLabel?: string;
  /** Label for the confirm action button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel: string;
  /** Label for the dialog title/heading */
  sheetTitle: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Controlled open state (optional — if provided, triggerLabel is ignored) */
  open?: boolean;
  /** Callback when dialog should close (required if open is provided) */
  onOpenChange?: (isOpen: boolean) => void;
};

/**
 * Generic single/multi-select chip picker that opens a modal dialog via ActionDialog.
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
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;

  const [selected, setSelected] = useState<string[]>(
    mode === "single" ? [defaultLabel as string] : (defaultLabel as string[])
  );
  const [busy, setBusy] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };

  const handleCancel = () => {
    // Reset to default on cancel
    setSelected(
      mode === "single" ? [defaultLabel as string] : (defaultLabel as string[])
    );
    handleOpenChange(false);
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
      handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {triggerLabel && !isControlled && (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => handleOpenChange(true)}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface text-foreground text-sm font-medium hover:bg-surface/80 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {triggerLabel}
        </button>
      )}

      <ActionDialog
        open={open}
        title={sheetTitle}
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        onOpenChange={handleOpenChange}
        onConfirm={handleConfirm}
        pending={busy}
      >
        {busy ? (
          <div className="flex items-center justify-center py-8">
            <SpinnerIcon className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => {
              const isSelected = selected.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleToggle(label)}
                  disabled={busy}
                  className={isSelected ? `${chipClassName.accent} cursor-pointer hover:bg-accent/10 transition-colors disabled:cursor-not-allowed disabled:opacity-60` : `${chipClassName.muted} cursor-pointer hover:bg-border/10 transition-colors disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </ActionDialog>
    </>
  );
}
