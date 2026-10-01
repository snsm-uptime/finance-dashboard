"use client";

import { useRef, useState } from "react";

import { chipClassName } from "@/components/Chip";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SpinnerIcon } from "@/app/icons";
import { useFocusTrap } from "@/hooks";

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
  /** Label for the sheet title/dialog heading */
  sheetTitle: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Controlled open state (optional — if provided, triggerLabel is ignored) */
  open?: boolean;
  /** Callback when sheet should close (required if open is provided) */
  onOpenChange?: (isOpen: boolean) => void;
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
  open: controlledOpen,
  onOpenChange,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

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

  useFocusTrap({
    isActive: open,
    containerRef: panelRef,
    defaultFocusRef: cancelRef,
    onEscapePress: handleCancel,
  });

  const getDisplayLabels = () => {
    // Always show all labels; selection is indicated by visual styling
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
      handleOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const displayLabels = getDisplayLabels();

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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6"
          role="presentation"
          onClick={handleCancel}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="chip-selector-title"
            className="w-full max-w-[28rem] rounded-md border border-border bg-surface p-5 shadow-none"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="chip-selector-title" className="m-0 text-[1.05rem] font-[550] text-foreground">
              {sheetTitle}
            </h2>

            {busy ? (
              <div className="flex items-center justify-center py-8">
                <SpinnerIcon className="w-6 h-6 animate-spin text-accent" />
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {displayLabels.map((label) => {
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

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <GhostButton ref={cancelRef} onClick={handleCancel} disabled={busy}>
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
          </div>
        </div>
      )}
    </>
  );
}
