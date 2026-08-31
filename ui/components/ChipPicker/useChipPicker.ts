"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

export type UseChipPickerOptions = {
  /** Fired right after the panel opens — e.g. to lazily fetch option data. */
  onOpen?: () => void;
  /** Fired right after the panel closes (toggle-close, Escape, or a caller-driven `close()`). */
  onClose?: () => void;
};

export type ChipPickerState = {
  chipId: string;
  panelId: string;
  chipRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  toggle: () => void;
  close: () => void;
  onRootKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * Shared open/close + focus/id/Escape wiring behind the chip-trigger +
 * SlideDown-panel pattern (OriginChipPicker, CyclePeriodSelector,
 * CardRoutingControl). Callers compose `ChipTrigger` + `ChipOptionsPanel`
 * around this state rather than hand-rolling it per component.
 */
export function useChipPicker({ onOpen, onClose }: UseChipPickerOptions = {}): ChipPickerState {
  const reactId = useId();
  const chipId = `${reactId}-chip`;
  const panelId = `${reactId}-panel`;
  const chipRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    onClose?.();
    chipRef.current?.focus();
  }

  function toggle() {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    onOpen?.();
  }

  function onRootKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    close();
  }

  return { chipId, panelId, chipRef, open, toggle, close, onRootKeyDown };
}
