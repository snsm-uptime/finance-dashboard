"use client";

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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 px-6"
      role="presentation"
      onClick={onCancel}
    >
      <div
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
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-sm border border-border bg-transparent px-3 py-[9px] text-[0.95rem] font-[550] text-foreground"
            onClick={onCancel}
            disabled={pending}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-sm border-none bg-accent px-3 py-[9px] text-[0.95rem] font-[550] text-on-accent"
            onClick={onConfirm}
            disabled={pending}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
