import type { CSSProperties } from "react";

import { Chip } from "@/components/Chip";

import { ReceiptRowMenu, type ReceiptRowMenuMessages } from "./ReceiptRowMenu";

export type ReceiptRowProps = {
  title?: string;
  when?: string;
  /** Payer alias without `@`; rendered in accent before the date. */
  payerAlias?: string;
  amount?: string;
  originChip?: string;
  /** "you borrowed" / "you lent" — sits above the viewer's net amount. */
  directionLabel?: string;
  netLabel?: string;
  netPolarity?: "owe" | "owed";
  menu?: ReceiptRowMenuMessages;
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

export function ReceiptRow({
  title,
  when,
  payerAlias,
  amount,
  originChip,
  directionLabel,
  netLabel,
  netPolarity,
  menu,
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
    <div
      className={`grid items-center gap-x-[var(--space-4)] gap-y-[2px] ${rowChrome}`}
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
        {amount ? (
          <span style={typeStyle.amount} className="shrink-0 tabular-nums text-muted">
            {amount}
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

      {menu ? (
        <div className="self-center" style={{ gridArea: "menu" }}>
          <ReceiptRowMenu messages={menu} />
        </div>
      ) : null}

      <div className="flex min-w-0 items-center gap-2" style={{ gridArea: "meta" }}>
        {when ? (
          <span style={typeStyle.meta} className="shrink-0 text-muted">
            {when}
          </span>
        ) : null}
        {originChip ? <Chip>
          {payerAlias ? (
            <span style={typeStyle.meta} className="truncate text-accent">
              {payerAlias}:&nbsp;
            </span>
          ) : null}
          {originChip}</Chip> : null}
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
  );
}
