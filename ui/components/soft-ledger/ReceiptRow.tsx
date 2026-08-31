import type { CSSProperties, ReactNode } from "react";

import { Chip, type ChipTone } from "@/components/Chip";

import { ReceiptRowMenu, type ReceiptRowMenuMessages, type ReceiptRowRollback } from "./ReceiptRowMenu";

export type ReceiptRowProps = {
  title?: string;
  when?: string;
  /** Payer alias without `@`; rendered as accent `@alias:` inside the origin chip. */
  payerAlias?: string;
  amount?: string;
  originChip?: string;
  originChipTone?: ChipTone;
  /** Disabled look for origin chips the viewer cannot assign. */
  originDisabled?: boolean;
  /** Clickable origin control; when set, replaces the display `originChip`. */
  originAction?: ReactNode;
  /** Panel below the row grid (e.g. origin `SlideDown`). */
  originPanel?: ReactNode;
  /** "you borrowed" / "you lent" — sits above the viewer's net amount. */
  directionLabel?: string;
  netLabel?: string;
  netPolarity?: "owe" | "owed";
  menu?: ReceiptRowMenuMessages;
  menuSlot?: ReactNode;
  rollback?: ReceiptRowRollback;
  /** Localized "New" chip text for freshly imported parser rows (Story 4.15). */
  newBadgeLabel?: string;
  /** Empty settle surface — muted placeholder, no invented totals. */
  emptyLabel?: string;
  /** FX audit detail (Story 3.5 AC #3) — rate/date, keyboard-accessible via <details>. */
  fxSummary?: string;
  fxDetail?: string;
};

const ICON_PX = 40;

const rowChrome =
  "py-[var(--row-y)] px-[var(--space-1)] border-b border-border";

const typeStyle = {
  body: {
    fontFamily: "var(--type-body-face)",
    fontSize: "var(--type-body-size)",
    fontWeight: "var(--type-body-weight)",
    lineHeight: "var(--type-body-lh)",
  },
  meta: {
    fontFamily: "var(--type-meta-face)",
    fontSize: "var(--type-meta-size)",
    fontWeight: "var(--type-meta-weight)",
  },
  amount: {
    fontFamily: "var(--type-amount-inline-face)",
    fontSize: "var(--type-amount-inline-size)",
    fontWeight: "var(--type-amount-inline-weight)",
  },
  net: {
    fontFamily: "var(--type-amount-inline-face)",
    fontSize: "var(--type-strip-amount-size)",
    lineHeight: "var(--type-amount-inline-size)",
    fontWeight: "var(--type-amount-inline-weight)"
  }
} as const satisfies Record<string, CSSProperties>;

export function OriginPayerAlias({ alias }: { alias: string }) {
  return (
    <span style={typeStyle.meta} className="truncate text-accent">
      @{alias}:&nbsp;
    </span>
  );
}

function OriginMeta({
  payerAlias,
  originChip,
  originChipTone,
  originDisabled,
  originAction,
}: {
  payerAlias?: string;
  originChip?: string;
  originChipTone: ChipTone;
  originDisabled?: boolean;
  originAction?: ReactNode;
}) {
  if (originAction) return originAction;
  if (!originChip) return null;
  return (
    <Chip tone={originChipTone} disabled={originDisabled}>
      {payerAlias ? <OriginPayerAlias alias={payerAlias} /> : null}
      <span className={originDisabled ? "text-muted" : undefined}>{originChip}</span>
    </Chip>
  );
}

export function ReceiptRow({
  title,
  when,
  payerAlias,
  amount,
  originChip,
  originChipTone = "muted",
  originDisabled = false,
  originAction,
  originPanel,
  directionLabel,
  netLabel,
  netPolarity,
  menu,
  menuSlot,
  rollback,
  newBadgeLabel,
  emptyLabel,
  fxSummary,
  fxDetail,
}: ReceiptRowProps) {
  if (emptyLabel && !title) {
    return (
      <div className={`grid grid-cols-1 ${rowChrome}`} role="status">
        <span style={typeStyle.meta} className="text-muted">
          {emptyLabel}
        </span>
      </div>
    );
  }

  const netClass =
    netPolarity === "owe" ? "text-owe" : netPolarity === "owed" ? "text-owed" : "text-muted";
  const showFx = Boolean(fxSummary && fxDetail);

  return (
    <div className={rowChrome}>
      <div
        className="grid items-center gap-x-[var(--space-4)] gap-y-[2px]"
        style={{
          gridTemplateColumns: `${ICON_PX}px minmax(0, 1fr) auto auto`,
          gridTemplateAreas: [
            `"icon title direction menu"`,
            `"icon meta  net       menu"`,
            ...(showFx ? [`". fx fx ."`] : []),
          ].join(" "),
        }}
      >
        <div
          data-slot="type-icon"
          className="box-border p-2 self-center"
          style={{ gridArea: "icon", width: ICON_PX, height: ICON_PX }}
          aria-hidden="true"
        >
          <div className="h-full w-full rounded-[6px] border border-border" />
        </div>

        <div className="flex min-w-0 items-center gap-2" style={{ gridArea: "title" }}>
          {title ? (
            <span style={typeStyle.body} className="min-w-0 truncate text-foreground">
              {title}
            </span>
          ) : null}
        </div>

        {directionLabel ? (
          <span
            style={{ ...typeStyle.meta, gridArea: "direction" }}
            className={`whitespace-nowrap text-right ${netClass}`}
          >
            {directionLabel}
          </span>
        ) : null}

        {menuSlot ? (
          <div className="self-center" style={{ gridArea: "menu" }}>
            {menuSlot}
          </div>
        ) : menu ? (
          <div className="self-center" style={{ gridArea: "menu" }}>
            <ReceiptRowMenu messages={menu} rollback={rollback} />
          </div>
        ) : null}

        <div className="flex min-w-0 items-center gap-2" style={{ gridArea: "meta" }}>
          {when ? (
            <span style={typeStyle.meta} className="shrink-0 text-muted">
              {when}
            </span>
          ) : null}
          <OriginMeta
            payerAlias={payerAlias}
            originChip={originChip}
            originChipTone={originChipTone}
            originDisabled={originDisabled}
            originAction={originAction}
          />
          {amount ? (
            <span style={typeStyle.amount} className="shrink-0 tabular-nums text-muted">
              {amount}
            </span>
          ) : null}
          {newBadgeLabel ? <Chip tone="accent">{newBadgeLabel}</Chip> : null}
        </div>

        {netLabel ? (
          <span
            style={{ ...typeStyle.net, gridArea: "net" }}
            className={`text-right tabular-nums ${netClass}`}
          >
            {netLabel}
          </span>
        ) : null}

        {showFx ? (
          <details className="text-muted" style={{ gridArea: "fx" }}>
            <summary style={typeStyle.meta} className="cursor-pointer" aria-label={fxDetail}>
              {fxSummary}
            </summary>
            <p style={typeStyle.meta}>{fxDetail}</p>
          </details>
        ) : null}
      </div>
      {originPanel}
    </div>
  );
}
