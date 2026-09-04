"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  /** `YYYY-MM-DD` or `null` (unset stays open-ended). */
  start: string | null;
  end: string | null;
  onChange: (start: string | null, end: string | null) => void;
  fromLabel: string;
  toLabel: string;
  clearLabel: string;
  locale: "en" | "es";
  disabled?: boolean;
  /**
   * Overrides the default two-button field row with a custom trigger (e.g.
   * the ghost budget card's calendar-icon slot). Receives the same
   * open-popover handler the default row uses — the popover itself and its
   * positioning/outside-click wiring are unchanged.
   */
  renderTrigger?: (props: { open: () => void; disabled: boolean; popoverOpen: boolean }) => React.ReactNode;
};

type Cell = { dateStr: string; day: number; inMonth: boolean; isToday: boolean };

const WEEKDAY_KEYS = [0, 1, 2, 3, 4, 5, 6];
const POPOVER_WIDTH_PX = 248;
/** Extra margin so the popover doesn't sit flush against the viewport edge. */
const VIEWPORT_MARGIN_PX = 8;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseDateStr(s: string): { year: number; month: number; day: number } {
  const [year, month, day] = s.split("-").map(Number);
  return { year, month: month - 1, day };
}

function buildMonthGrid(viewYear: number, viewMonth: number, todayStr: string): Cell[] {
  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Cell[] = [];
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = 0; i < startWeekday; i++) {
    const day = prevMonthDays - startWeekday + 1 + i;
    const prev = new Date(viewYear, viewMonth - 1, day);
    const dateStr = toDateStr(prev.getFullYear(), prev.getMonth(), prev.getDate());
    cells.push({ dateStr, day, inMonth: false, isToday: dateStr === todayStr });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = toDateStr(viewYear, viewMonth, day);
    cells.push({ dateStr, day, inMonth: true, isToday: dateStr === todayStr });
  }
  while (cells.length < 42) {
    const next = new Date(viewYear, viewMonth + 1, cells.length - startWeekday - daysInMonth + 1);
    const dateStr = toDateStr(next.getFullYear(), next.getMonth(), next.getDate());
    cells.push({ dateStr, day: next.getDate(), inMonth: false, isToday: dateStr === todayStr });
  }
  return cells;
}

/**
 * Field row + calendar popover replacing native `<input type="date">` pairs
 * (mockup: `budget-card-and-calendar.html`). Selecting a day when the range
 * is already complete (or unset) starts a new range at that day; a second
 * click completes it, ordering the two dates regardless of click order.
 */
export function DateRangeField({
  start,
  end,
  onChange,
  fromLabel,
  toLabel,
  clearLabel,
  locale,
  disabled = false,
  renderTrigger,
}: Props) {
  const [open, setOpen] = useState(false);
  // Which edge of the trigger the popover hangs from — flipped to "right"
  // when opening "left" (the default) would push it past the viewport's
  // right edge, e.g. the ghost budget card's calendar-icon trigger sitting
  // near the right edge of a narrow masonry column.
  const [align, setAlign] = useState<"left" | "right">("left");
  const rootRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
  const anchor = start ?? end ?? todayStr;
  const anchorParts = parseDateStr(anchor);
  const [viewYear, setViewYear] = useState(anchorParts.year);
  const [viewMonth, setViewMonth] = useState(anchorParts.month);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "es" ? "es-CR" : "en-US", {
        month: "long",
        year: "numeric",
      }).format(new Date(viewYear, viewMonth, 1)),
    [viewYear, viewMonth, locale],
  );
  const dayLabels = useMemo(
    () =>
      WEEKDAY_KEYS.map((offset) =>
        new Intl.DateTimeFormat(locale === "es" ? "es-CR" : "en-US", { weekday: "narrow" }).format(
          new Date(2026, 0, 4 + offset),
        ),
      ),
    [locale],
  );
  const formatFull = (dateStr: string) => {
    const { year, month, day } = parseDateStr(dateStr);
    return new Intl.DateTimeFormat(locale === "es" ? "es-CR" : "en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(year, month, day));
  };

  const cells = buildMonthGrid(viewYear, viewMonth, todayStr);

  function openPopover() {
    if (disabled) return;
    const base = start ?? end ?? todayStr;
    const parts = parseDateStr(base);
    setViewYear(parts.year);
    setViewMonth(parts.month);
    const rect = rootRef.current?.getBoundingClientRect();
    const wouldOverflowRight =
      rect !== undefined && rect.left + POPOVER_WIDTH_PX > window.innerWidth - VIEWPORT_MARGIN_PX;
    setAlign(wouldOverflowRight ? "right" : "left");
    setOpen(true);
  }

  function goMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function onDayClick(dateStr: string) {
    if (!start || (start && end)) {
      onChange(dateStr, null);
      return;
    }
    // start set, end unset: complete the range, ordering the two dates.
    if (dateStr < start) {
      onChange(dateStr, start);
    } else if (dateStr === start) {
      onChange(start, null);
      return;
    } else {
      onChange(start, dateStr);
    }
    setOpen(false);
  }

  function clear() {
    onChange(null, null);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      {renderTrigger ? (
        // `openPopover` reads `rootRef.current` inside its own body, only
        // when actually invoked (a click handler) — never synchronously
        // during this render. The compiler can't prove that from a
        // caller-supplied `renderTrigger`, so it conservatively flags
        // passing the closure at all; same pattern already accepted in
        // Tooltip.tsx's `updatePosition`/`triggerRef` usage.
        /* eslint-disable-next-line react-hooks/refs */
        renderTrigger({ open: openPopover, disabled, popoverOpen: open })
      ) : (
        <div className="flex items-center gap-2 rounded-[8px] border-2 border-border bg-background px-[0.65rem] py-[0.5rem]">
          <button
            type="button"
            disabled={disabled}
            onClick={openPopover}
            className={`font-inherit text-[0.9rem] bg-transparent border-none outline-none ${start ? "text-foreground" : "text-muted"} cursor-pointer disabled:cursor-not-allowed`}
          >
            {start ? formatFull(start) : fromLabel}
          </button>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          <button
            type="button"
            disabled={disabled}
            onClick={openPopover}
            className={`font-inherit text-[0.9rem] bg-transparent border-none outline-none ${end ? "text-foreground" : "text-muted"} cursor-pointer disabled:cursor-not-allowed`}
          >
            {end ? formatFull(end) : toLabel}
          </button>
        </div>
      )}
      {open ? (
        <div
          className={`absolute z-10 mt-2 w-[248px] rounded-[10px] border border-border bg-surface p-[10px] shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="rounded-[4px] border-none bg-transparent px-1.5 py-0.5 text-[0.85rem] text-muted cursor-pointer hover:bg-border"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-[0.78rem] text-foreground">{monthLabel}</span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="rounded-[4px] border-none bg-transparent px-1.5 py-0.5 text-[0.85rem] text-muted cursor-pointer hover:bg-border"
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-[2px] text-center">
            {dayLabels.map((label, i) => (
              <span
                key={i}
                className="pb-1 text-[0.58rem] font-[550] uppercase tracking-[0.03em] text-muted"
              >
                {label}
              </span>
            ))}
            {cells.map((cell) => {
              const inRange = !!start && !!end && cell.dateStr >= start && cell.dateStr <= end;
              const isSelected = cell.dateStr === start || cell.dateStr === end;
              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => onDayClick(cell.dateStr)}
                  className={[
                    "rounded-full py-[5px] text-[0.72rem] tabular-nums border-none cursor-pointer",
                    cell.inMonth ? "text-foreground" : "text-border",
                    cell.isToday ? "shadow-[inset_0_0_0_1px_var(--muted)]" : "",
                    inRange && !isSelected ? "bg-accent/15 rounded-none" : "",
                    isSelected ? "bg-accent text-on-accent font-[550]" : "bg-transparent",
                  ].join(" ")}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
          <div className="mt-2.5 flex justify-end gap-2 border-t border-border pt-2">
            <button
              type="button"
              onClick={clear}
              className="border-none bg-transparent text-[0.72rem] text-muted cursor-pointer"
            >
              {clearLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
