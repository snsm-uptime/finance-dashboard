"use client";

import { chipClassName } from "@/components/Chip";
import { ChipOptionsPanel, useChipPicker, type ChipOption } from "@/components/ChipPicker";

export type SourceListChipPickerOption = { id: string; name: string };

type Props = {
  options: SourceListChipPickerOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  ariaLabel: string;
  addLabel: string;
  disabled?: boolean;
};

const focusRing =
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const removableChipClassName = `${chipClassName.accent} ${focusRing} gap-1 hover:bg-accent/10 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60`;
const addTriggerClassName = `inline-flex flex-shrink-0 items-center gap-1 m-0 py-[0.18rem] px-[0.5rem] rounded-[8px] border border-dashed border-border text-muted bg-transparent text-[0.65rem] font-[550] tracking-[0.02em] leading-[1.15] ${focusRing} hover:border-muted disabled:cursor-not-allowed disabled:opacity-60`;

/**
 * Multi-select chip picker (Story 7.5 amendment / budgets ghost-card
 * redesign): selected options render as their own accent chips with an
 * inline remove — no panel needed to deselect. One trailing dashed "+"
 * chip opens a slide-down panel listing only the not-yet-selected options.
 * Built on the existing `ChipTrigger`/`ChipOptionsPanel`/`useChipPicker`
 * single-select primitives rather than a from-scratch multi widget.
 */
export function SourceListChipPicker({
  options,
  selectedIds,
  onToggle,
  ariaLabel,
  addLabel,
  disabled = false,
}: Props) {
  const { chipId, panelId, chipRef, open, toggle, close, onRootKeyDown } = useChipPicker();
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const unselectedChipOptions: ChipOption[] = options
    .filter((option) => !selectedIds.includes(option.id))
    .map((option) => ({ value: option.id, label: option.name }));

  function selectFromPanel(id: string) {
    onToggle(id);
    close();
  }

  return (
    <div role="group" aria-label={ariaLabel} onKeyDown={onRootKeyDown} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(option.id)}
            className={removableChipClassName}
            aria-label={`${option.name} (${ariaLabel})`}
          >
            {option.name}
            <span aria-hidden="true">×</span>
          </button>
        ))}
        {selected.length < options.length ? (
          <button
            ref={chipRef}
            id={chipId}
            type="button"
            disabled={disabled}
            aria-label={addLabel}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={toggle}
            className={addTriggerClassName}
          >
            {addLabel}
          </button>
        ) : null}
      </div>
      <ChipOptionsPanel
        open={open}
        id={panelId}
        labelledBy={chipId}
        options={unselectedChipOptions}
        disabled={disabled}
        onSelect={selectFromPanel}
        contentClassName="mt-1 flex max-h-[6.4rem] flex-wrap items-start gap-2 overflow-y-auto rounded-[8px] p-2"
      />
    </div>
  );
}
