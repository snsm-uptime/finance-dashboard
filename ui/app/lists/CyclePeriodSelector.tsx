"use client";

import { useRouter } from "next/navigation";

import { SoftLedgerSelect, type SoftLedgerSelectOption } from "@/components/soft-ledger/Select";

export type CyclePeriodOption = {
  statementId: string;
  cardLabel: string | null;
  periodStart: string;
  periodEnd: string;
};

export type CyclePeriodSelectorMessages = {
  cyclePeriodSelectorLabel: string;
  cyclePeriodOptionUnknownCard: string;
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
 */
export function CyclePeriodSelector({ listId, cycles, selectedStatementId, messages }: Props) {
  const router = useRouter();

  if (cycles.length <= 1) return null;

  const options: SoftLedgerSelectOption[] = cycles.map((cycle) => ({
    value: cycle.statementId,
    label: cyclePeriodOptionLabel(cycle, messages),
  }));
  const value = selectedStatementId ?? cycles[0].statementId;

  function onChange(next: string) {
    router.push(`/lists/${encodeURIComponent(listId)}?period=${encodeURIComponent(next)}`);
  }

  return (
    <SoftLedgerSelect
      value={value}
      options={options}
      aria-label={messages.cyclePeriodSelectorLabel}
      onChange={onChange}
    />
  );
}
