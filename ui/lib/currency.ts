function formatCrcNumber(amount: string): string {
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
