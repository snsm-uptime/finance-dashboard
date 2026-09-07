"use client";

import type { ReactNode } from "react";

import { ChipOptionsPanel, ChipTrigger, useChipPicker, type ChipOption } from ".";

export type SingleChipPickerProps = {
  options: ChipOption[];
  selectedValue: string;
  onSelect: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  error?: ReactNode;
};

/**
 * Generic single-select chip picker: one accent chip shows the current
 * setting; clicking it slides down a panel of the remaining options.
 * Shared by any single-choice setting that used to hand-roll its own
 * `ChipTrigger`/`ChipOptionsPanel`/`useChipPicker` wiring (default expense
 * origin, default review-routing list, ...).
 */
export function SingleChipPicker({
  options,
  selectedValue,
  onSelect,
  ariaLabel,
  disabled = false,
  error,
}: SingleChipPickerProps) {
  const { chipId, panelId, chipRef, open, toggle, close, onRootKeyDown } = useChipPicker();
  const selectedOption = options.find((option) => option.value === selectedValue);

  function selectFromPanel(value: string) {
    onSelect(value);
    close();
  }

  return (
    <div onKeyDown={onRootKeyDown}>
      <ChipTrigger
        ref={chipRef}
        id={chipId}
        panelId={panelId}
        open={open}
        tone="accent"
        ariaLabel={ariaLabel}
        onClick={toggle}
      >
        {selectedOption?.label ?? selectedValue}
      </ChipTrigger>
      <ChipOptionsPanel
        open={open}
        id={panelId}
        labelledBy={chipId}
        options={options}
        selectedValue={selectedValue}
        disabled={disabled}
        error={error}
        onSelect={selectFromPanel}
      />
    </div>
  );
}
