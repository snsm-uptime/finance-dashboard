"use client";

import { useEffect, useId, useRef, useState } from "react";

import { DotsIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";

export type ReceiptRowMenuMessages = {
  menuAria: string;
  editLabel: string;
  deleteLabel: string;
};

type Props = {
  messages: ReceiptRowMenuMessages;
};

/**
 * Home-list-style overflow menu. Edit/Delete are present and do not persist.
 */
export function ReceiptRowMenu({ messages }: Props) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div className="relative self-center" ref={rootRef}>
      <IconButton
        type="button"
        variant="muted"
        label={messages.menuAria}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        icon={<DotsIcon />}
      />
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute top-[calc(100%+0.35rem)] right-0 z-[2] min-w-[11rem] overflow-hidden rounded-[8px] border border-border bg-surface shadow-[0_8px_20px_color-mix(in_srgb,var(--foreground)_12%,transparent)]"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full m-0 py-[0.65rem] px-4 border-0 bg-transparent text-foreground text-left text-[0.95rem] font-[500] cursor-pointer hover:bg-accent/12 focus-visible:outline-none focus-visible:bg-accent/18"
            onClick={() => setOpen(false)}
          >
            {messages.editLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full m-0 py-[0.65rem] px-4 border-0 bg-transparent text-owe/85 text-left text-[0.95rem] font-[500] cursor-pointer hover:bg-owe/12 focus-visible:outline-none focus-visible:bg-owe/18"
            onClick={() => setOpen(false)}
          >
            {messages.deleteLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
