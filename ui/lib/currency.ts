export function formatCrcNumber(amount: string): string {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return amount;
  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** Soft-Ledger plain CRC voice (UX-DR17) — e.g. ₡10.00 / ₡42,500. */
export function formatCrcAmount(amount: string): string {
  return `₡${formatCrcNumber(amount)}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CRC: "₡",
  USD: "$",
};

/**
 * Currency-aware amount formatter for surfaces that aren't CRC-only
 * (Story 6.3 budgets: v1 FX scope is CRC + USD). Falls back to the raw
 * currency code as a prefix for anything outside that set rather than
 * guessing a symbol.
 */
export function formatMoneyAmount(amount: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency];
  if (symbol) return `${symbol}${formatCrcNumber(amount)}`;
  return `${currency} ${formatCrcNumber(amount)}`;
}
