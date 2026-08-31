"use client";

import { useRouter } from "next/navigation";

import { ChipOptionsPanel, ChipTrigger, useChipPicker, type ChipOption } from "@/components/ChipPicker";

export type CyclePeriodOption = {
  statementId: string;
  cardLabel: string | null;
  periodStart: string;
  periodEnd: string;
};

export type CyclePeriodSelectorMessages = {
  cyclePeriodSelectorLabel: string;
  cyclePeriodOptionUnknownCard: string;
  cyclePeriodOptionAll: string;
};

type Props = {
  listId: string;
  cycles: CyclePeriodOption[];
  selectedStatementId: string | null;
  messages: CyclePeriodSelectorMessages;
};

/** Card label + date-range option text — card labels are user free text (UX-DR18). */
export function cyclePeriodOptionLabel(
  cycle: CyclePeriodOption,
  messages: CyclePeriodSelectorMessages,
): string {
  const card = cycle.cardLabel && cycle.cardLabel.trim() ? cycle.cardLabel : messages.cyclePeriodOptionUnknownCard;
  return `${card} • ${cycle.periodStart} – ${cycle.periodEnd}`;
}

/**
 * Statement/billing-cycle picker for shared-expenses (Story 5.9, FR-39).
 * Renders nothing for 0 or 1 cycles (AC #3 — single-cycle lists need no
 * picker friction); a URL-driven `?period=` navigation, not client refetch
 * (same RSC-boundary-safe pattern Story 5.7 used for its resolve link).
 *
 * "All periods" (empty-string sentinel) is always the first option and the
 * default when no `?period=` is selected — narrowing to one cycle is opt-in,
 * so it can never silently hide a just-added hand entry (debug fix).
 *
 * Same chip + SlideDown pattern as OriginChipPicker and CardRoutingControl,
 * via the shared `@/components/ChipPicker` primitives.
 */
export function CyclePeriodSelector({ listId, cycles, selectedStatementId, messages }: Props) {
  const router = useRouter();
  const { chipId, panelId, chipRef, open, toggle, close, onRootKeyDown } = useChipPicker();

  if (cycles.length <= 1) return null;

  const options: ChipOption[] = [
    { value: "", label: messages.cyclePeriodOptionAll },
    ...cycles.map((cycle) => ({
      value: cycle.statementId,
      label: cyclePeriodOptionLabel(cycle, messages),
    })),
  ];
  const value = selectedStatementId ?? "";
  const selected = options.find((option) => option.value === value) ?? options[0];

  function onSelect(next: string) {
    close();
    const target = `/lists/${encodeURIComponent(listId)}`;
    router.push(next === "" ? target : `${target}?period=${encodeURIComponent(next)}`);
  }

  return (
    <div onKeyDown={onRootKeyDown}>
      <ChipTrigger
        ref={chipRef}
        id={chipId}
        panelId={panelId}
        open={open}
        ariaLabel={messages.cyclePeriodSelectorLabel}
        onClick={toggle}
      >
        {selected.label}
      </ChipTrigger>
      <ChipOptionsPanel open={open} id={panelId} labelledBy={chipId} options={options} onSelect={onSelect} />
    </div>
  );
}
