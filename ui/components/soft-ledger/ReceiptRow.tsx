"use client";

import type { CSSProperties, ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";

import { Avatar } from "@/components/Avatar";
import { Chip, type ChipTone } from "@/components/Chip";

import { ReceiptRowMenu, type ReceiptRowMenuMessages, type ReceiptRowRollback } from "./ReceiptRowMenu";

/** Floor for the shrink-to-fit net amount so it never becomes unreadably small. */
const NET_AMOUNT_MIN_SCALE = 0.62;

export type ReceiptRowProps = {
  title?: string;
  when?: string;
  /** Payer alias without `@`; rendered as accent `@alias:` inside the origin chip. */
  payerAlias?: string;
  /** Stable id for the payer's deterministic avatar color (usually `payer_id`). */
  payerSeed?: string;
  /** Payer's base64 photo, when set — falls back to the initials circle. */
  payerPhoto?: string | null;
  amount?: string;
  originChip?: string;
  originChipTone?: ChipTone;
  /** Disabled look for origin chips the viewer cannot assign. */
  originDisabled?: boolean;
  /** True when `originChip` is the "Unknown" origin label for another member's row — collapses the chip to just the avatar. */
  originUnknown?: boolean;
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
    fontSize: "calc(var(--type-strip-amount-size) * var(--net-amount-scale, 1))",
    lineHeight: "var(--type-amount-inline-size)",
    fontWeight: "var(--type-amount-inline-weight)"
  }
} as const satisfies Record<string, CSSProperties>;

export function OriginPayerAlias({
  alias,
  seed,
  photo,
}: {
  alias: string;
  seed?: string;
  photo?: string | null;
}) {
  // Avatar replaces the "@alias:" text — the alias is still available as
  // the avatar's native hover tooltip. Falls back to text only when there's
  // no stable seed to render an avatar for (no member id available).
  if (seed) {
    return <>
      <Avatar
        alias={alias}
        seed={seed}
        photoBase64={photo}
        size="xs"
        className="-ml-[0.5rem] -my-[0.18rem] rounded-r-none"
      />
      &nbsp;&nbsp;
    </>;
  }
  return (
    <span style={typeStyle.meta} className="truncate text-accent">
      @{alias}:&nbsp;
    </span>
  );
}

function OriginMeta({
  payerAlias,
  payerSeed,
  payerPhoto,
  originChip,
  originChipTone,
  originDisabled,
  originUnknown,
  originAction,
}: {
  payerAlias?: string;
  payerSeed?: string;
  payerPhoto?: string | null;
  originChip?: string;
  originChipTone: ChipTone;
  originDisabled?: boolean;
  originUnknown?: boolean;
  originAction?: ReactNode;
}) {
  if (originAction) return originAction;
  if (!originChip) return null;
  // Unknown origin on another member's row: the payer avatar alone is
  // enough context — the "Unknown" text label would just be noise.
  if (originUnknown && payerSeed) {
    return <Avatar alias={payerAlias ?? ""} seed={payerSeed} photoBase64={payerPhoto} size="xs" />;
  }
  return (
    <Chip tone={originChipTone} disabled={originDisabled}>
      <span className="inline-flex items-center gap-1">
        {payerAlias ? (
          <OriginPayerAlias alias={payerAlias} seed={payerSeed} photo={payerPhoto} />
        ) : null}
        <span className={originDisabled ? "text-muted" : undefined}>{originChip}</span>
      </span>
    </Chip>
  );
}

export function ReceiptRow({
  title,
  when,
  payerAlias,
  payerSeed,
  payerPhoto,
  amount,
  originChip,
  originChipTone = "muted",
  originDisabled = false,
  originUnknown = false,
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
  const rowRef = useRef<HTMLDivElement>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const netRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const meta = metaRef.current;
    const net = netRef.current;
    if (!row || !meta || !net) return;

    const recalc = () => {
      // Reset to the base scale first so we always measure the worst case,
      // otherwise a previous shrink would mask overflow that has since resolved.
      // Driven through a CSS custom property (rather than net.style.fontSize
      // directly) so this imperative write never collides with the fontSize
      // React already owns via the `typeStyle.net` style prop.
      net.style.setProperty("--net-amount-scale", "1");
      net.classList.remove("truncate");
      net.style.maxWidth = "";
      const overflow = meta.scrollWidth - meta.clientWidth;
      if (overflow <= 0) return;

      const naturalWidth = net.scrollWidth;
      if (naturalWidth <= 0) return;

      const buffer = 4;
      const rawTargetWidth = naturalWidth - overflow - buffer;
      const rawScale = rawTargetWidth / naturalWidth;
      const scale = Math.min(1, Math.max(NET_AMOUNT_MIN_SCALE, rawScale));
      net.style.setProperty("--net-amount-scale", String(scale));

      // The floor can't fully resolve overflow this wide — cap the box and
      // truncate the remainder instead of letting it spill past the row.
      if (rawScale < NET_AMOUNT_MIN_SCALE) {
        net.classList.add("truncate");
        net.style.maxWidth = `${Math.max(rawTargetWidth, 24)}px`;
      }
    };

    recalc();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recalc);
    observer.observe(row);
    return () => observer.disconnect();
  }, [
    title,
    when,
    payerAlias,
    payerSeed,
    payerPhoto,
    amount,
    originChip,
    originAction,
    originDisabled,
    originUnknown,
    originPanel,
    newBadgeLabel,
    netLabel,
    directionLabel,
    menu,
    menuSlot,
    rollback,
  ]);

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
        ref={rowRef}
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

        <div ref={metaRef} className="flex min-w-0 items-center gap-2" style={{ gridArea: "meta" }}>
          {when ? (
            <span style={typeStyle.meta} className="shrink-0 text-muted">
              {when}
            </span>
          ) : null}
          <OriginMeta
            payerAlias={payerAlias}
            payerSeed={payerSeed}
            payerPhoto={payerPhoto}
            originChip={originChip}
            originChipTone={originChipTone}
            originDisabled={originDisabled}
            originUnknown={originUnknown}
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
            ref={netRef}
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
