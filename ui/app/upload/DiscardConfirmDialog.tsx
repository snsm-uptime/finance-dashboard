"use client";

import { useRef } from "react";

import { useFocusTrap } from "@/hooks/useFocusTrap";
import { GhostButton } from "@/components/soft-ledger/GhostButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";

type DiscardConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DiscardConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending = false,
  onConfirm,
  onCancel,
}: DiscardConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useFocusTrap({
    isActive: open,
    containerRef: panelRef,
    defaultFocusRef: cancelRef,
    onEscapePress: onCancel,
  });

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-confirm-title"
        className="w-full max-w-[22rem] rounded-md border border-border bg-surface p-5 shadow-none"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="discard-confirm-title" className="m-0 text-[1.05rem] font-[550] text-foreground">
          {title}
        </h2>
        <p className="mt-3 mb-0 text-[0.9rem] leading-relaxed text-muted">{body}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <GhostButton ref={cancelRef} onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </GhostButton>
          <PrimaryButton onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
