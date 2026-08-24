import type { ReactNode } from "react";

type CreditCardFaceProps = {
  cardName: ReactNode;
  iban: string | null;
  filename: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  periodLabel: string;
  cornerAction?: ReactNode;
};

export function formatIbanGroups(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function parseYearMonth(iso: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

function monthToken(parsed: { year: number; month: number }): string {
  return `${MONTH_ABBR[parsed.month - 1]} ${String(parsed.year).slice(-2)}`;
}

export function formatCardPeriod(startIso: string | null, endIso: string | null): string {
  const start = startIso ? parseYearMonth(startIso) : null;
  const end = endIso ? parseYearMonth(endIso) : null;
  if (!start && !end) return "";
  if (!start && end) return monthToken(end);
  if (start && !end) return monthToken(start);
  if (!start || !end) return "";
  if (start.year === end.year && start.month === end.month) {
    return monthToken(start);
  }
  if (start.year === end.year) {
    return `${MONTH_ABBR[start.month - 1]}-${MONTH_ABBR[end.month - 1]} ${String(start.year).slice(-2)}`;
  }
  return `${monthToken(start)}-${monthToken(end)}`;
}

function BankMark() {
  return (
    <span
      className="block w-3.5 h-3.5 shrink-0 bg-white"
      style={{ borderRadius: "0 0 0 100%" }}
      aria-hidden
    />
  );
}

function Chip() {
  return (
    <svg width="48" height="36" viewBox="0 0 36 28" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="chip-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4e3a1" />
          <stop offset="22%" stopColor="#e6c65a" />
          <stop offset="38%" stopColor="#fff6d2" />
          <stop offset="52%" stopColor="#c9a227" />
          <stop offset="78%" stopColor="#8a6d12" />
          <stop offset="100%" stopColor="#d8b44a" />
        </linearGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="35"
        height="27"
        rx="5"
        fill="url(#chip-metal)"
        stroke="#f0d98a"
      />
      <path
        d="M0 10h36M0 18h36M12 0.5v27M24 0.5v27"
        stroke="#8a6d12"
        strokeWidth="0.7"
        opacity="0.45"
      />
    </svg>
  );
}

function Contactless() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-white">
      <path
        d="M9 8.2c1.6 1.5 1.6 6.1 0 7.6M12.2 6c2.5 2.4 2.5 9.6 0 12M15.4 3.8c3.4 3.3 3.4 13.1 0 16.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CreditCardFace({
  cardName,
  iban,
  filename,
  periodStart,
  periodEnd,
  periodLabel,
  cornerAction,
}: CreditCardFaceProps) {
  const ibanLine = iban ? `IBAN: ${formatIbanGroups(iban)}` : null;
  const date = formatCardPeriod(periodStart, periodEnd);

  return (
    <article
      className="relative isolate w-full max-w-full text-white"
      style={{
        borderRadius: "16px",
        background: "linear-gradient(160deg, #2a2a2a 0%, #141414 55%, #0d0d0d 100%)",
        boxShadow: "0 12px 28px rgba(20, 16, 10, 0.24)",
        padding: "0.85rem 1rem 0.8rem",
      }}
    >
      {cornerAction ? (
        <div className="absolute top-1.5 right-1.5 z-10">{cornerAction}</div>
      ) : null}

      <div className="flex flex-col gap-3">
        <header className="flex items-center pr-8">
          <div className="flex items-center gap-2 min-w-0">{cardName}</div>
        </header>

        <div className="my-3 flex items-center justify-between gap-3">
          <Chip />
          <span
            className="min-w-0 flex-1 text-center font-bold uppercase tracking-[0.14em] text-white/20 text-[0.72rem] leading-none select-none pointer-events-none"
            aria-hidden
          >
            Finance Helper
          </span>
          <Contactless />
        </div>

        {ibanLine ? (
          <p className="m-0 font-mono text-[0.95rem] font-medium tracking-[0.04em] leading-none whitespace-nowrap">
            {ibanLine}
          </p>
        ) : null}

        <footer className="flex items-end justify-between gap-3">
          <p className="m-0 min-w-0 truncate font-mono text-[0.72rem] uppercase tracking-[0.06em] text-white/90">
            {filename}
          </p>
          <div className="shrink-0 text-right">
            <p className="m-0 text-[0.48rem] uppercase tracking-[0.08em] leading-tight text-white/55">
              {periodLabel}
            </p>
            <p className="m-0 font-mono text-[0.85rem] tracking-[0.04em]">{date}</p>
          </div>
        </footer>
      </div>
    </article>
  );
}

export function CreditCardMark() {
  return <BankMark />;
}
