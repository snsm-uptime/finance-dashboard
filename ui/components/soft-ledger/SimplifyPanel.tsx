import { CopyButton } from "@/components/CopyButton/CopyButton";
import { Disclosure } from "@/components/Disclosure";

export type SimplifyTransfer = {
  fromMemberId: string;
  fromLabel: string;
  toMemberId: string;
  toLabel: string;
  amountCrc: string;
};

export type SimplifyPanelMessages = {
  title: string;
  copyLabel: string;
  copiedLabel: string;
};

/**
 * Plain-text group plan for outside-the-app sharing (AC #4, UX-DR17). Never
 * says "paid" and never looks like a settlement record — names, CRC, and
 * direction only.
 */
export function simplifyPlanTextFrom(transfers: SimplifyTransfer[]): string {
  return transfers
    .map((t) => `${t.fromLabel} pays ${t.toLabel} ${t.amountCrc}`)
    .join("\n");
}

type Props = {
  transfers: SimplifyTransfer[];
  messages: SimplifyPanelMessages;
};

/**
 * Presentational — literal `transfers` prop only, no fetching (Story 5.8).
 * The title is the disclosure toggle (closed by default); Copy stays in the
 * header, outside the toggle, so it stays reachable without expanding.
 * Already-minimal lists (no transfers) render nothing — there's no plan to disclose.
 */
export function SimplifyPanel({ transfers, messages }: Props) {
  if (transfers.length === 0) return null;
  return (
    <Disclosure
      title={messages.title}
      className="min-w-0"
      headerExtra={
        <CopyButton
          value={simplifyPlanTextFrom(transfers)}
          label={messages.copyLabel}
          copiedLabel={messages.copiedLabel}
        />
      }
    >
      <ul className="m-0 flex list-none flex-col gap-[var(--space-2)] p-0">
        {transfers.map((t, index) => (
          <li
            key={`${t.fromMemberId}-${t.toMemberId}-${index}`}
            className="flex items-baseline justify-between gap-[var(--space-2)]"
          >
            <span className="min-w-0 truncate text-foreground" style={{ fontFamily: "var(--type-meta-face)" }}>
              {t.fromLabel} → {t.toLabel}
            </span>
            <span className="tabular-nums text-foreground" style={{ fontFamily: "var(--type-meta-face)" }}>
              {t.amountCrc}
            </span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
