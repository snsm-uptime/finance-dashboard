"use client";

import { useRef, type ReactNode } from "react";

import { useFocusTrap } from "@/hooks/useFocusTrap";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";

export type ActionDialogProps = {
  /** Whether the dialog is open */
  open: boolean;
  /** Dialog title/heading */
  title: string;
  /** Main content of the dialog (accepts any ReactNode — text, chips, forms, etc.) */
  children: ReactNode;
  /** Label for the confirm action button */
  confirmLabel: string;
  /** Label for the cancel button */
  cancelLabel: string;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Callback when user confirms */
  onConfirm: () => void;
  /** Whether an async operation is pending (disables buttons, shows loading state) */
  pending?: boolean;
};

/**
 * Generic modal dialog for confirmations and actions with custom content.
 * Reusable for chip selection, confirmations, or any action-triggered dialog.
 *
 * Features:
 * - Controlled open state
 * - Backdrop click or Escape to cancel
 * - Focus trap and keyboard accessibility
 * - Pending/loading state support
 * - Flexible content area (accepts any ReactNode)
 */
export function ActionDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onOpenChange,
  onConfirm,
  pending = false,
}: ActionDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    isActive: open,
    containerRef: panelRef,
    defaultFocusRef: cancelRef,
    onEscapePress: () => onOpenChange(false),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        className="w-full max-w-[28rem] rounded-md border border-border bg-surface p-5 shadow-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="action-dialog-title" className="m-0 text-[1.05rem] font-[550] text-foreground">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <GhostButton
            ref={cancelRef}
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </GhostButton>
          <PrimaryButton onClick={onConfirm} disabled={pending} loading={pending}>
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
