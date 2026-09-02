"use client";

import { useEffect, useState } from "react";

import { SimplifyPanel, type SimplifyTransfer } from "@/components/soft-ledger/SimplifyPanel";
import { formatCrcAmount } from "@/lib/currency";

export type SimplifyColumnMessages = {
  title: string;
  copyLabel: string;
  copiedLabel: string;
  blockedLabel: string;
  errorGeneric: string;
};

type Props = {
  listId: string;
  /** AC #5 — no Simplify read while unresolved conflicts touch this list. */
  available: boolean;
  messages: SimplifyColumnMessages;
};

type RawTransfer = {
  from_member_id?: unknown;
  from_alias?: unknown;
  to_member_id?: unknown;
  to_alias?: unknown;
  amount_crc?: unknown;
};

function memberFallback(memberId: string): string {
  return `${memberId.slice(0, 8)}…`;
}

function asTransfers(data: unknown): SimplifyTransfer[] | null {
  if (!data || typeof data !== "object") return null;
  const rows = (data as { transfers?: unknown }).transfers;
  if (!Array.isArray(rows)) return null;
  const out: SimplifyTransfer[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") return null;
    const r = row as RawTransfer;
    if (typeof r.from_member_id !== "string" || typeof r.to_member_id !== "string" || typeof r.amount_crc !== "string") {
      return null;
    }
    out.push({
      fromMemberId: r.from_member_id,
      fromLabel: typeof r.from_alias === "string" && r.from_alias ? r.from_alias : memberFallback(r.from_member_id),
      toMemberId: r.to_member_id,
      toLabel: typeof r.to_alias === "string" && r.to_alias ? r.to_alias : memberFallback(r.to_member_id),
      amountCrc: formatCrcAmount(r.amount_crc),
    });
  }
  return out;
}

type SimplifyState =
  | { status: "loading" }
  | { status: "blocked" }
  | { status: "error" }
  | { status: "loaded"; transfers: SimplifyTransfer[] };

/**
 * Group-transfer plan, read automatically — no toggle. Renders as its own
 * grid column next to Balance on lists with 3+ members (caller gates that);
 * `available` only governs the AC #5 conflict block within this column.
 */
export function SimplifyColumn({ listId, available, messages }: Props) {
  // Tags each fetch result with the deps that produced it, so a stale
  // response from a superseded listId/available combo can't overwrite the
  // in-flight one — and so render (not the effect) can derive "loading"
  // for the new combo without a synchronous setState at the top of the effect.
  const requestKey = `${listId}:${available}`;
  const [result, setResult] = useState<{ key: string; state: SimplifyState }>({
    key: requestKey,
    state: { status: "loading" },
  });

  useEffect(() => {
    if (!available) return;
    let cancelled = false;
    const key = `${listId}:${available}`;
    (async () => {
      let response: Response;
      try {
        response = await fetch(`/api/lists/${encodeURIComponent(listId)}/settle/simplify`, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
      } catch {
        if (!cancelled) setResult({ key, state: { status: "error" } });
        return;
      }
      if (cancelled) return;
      if (response.status === 409) {
        setResult({ key, state: { status: "blocked" } });
        return;
      }
      if (!response.ok) {
        setResult({ key, state: { status: "error" } });
        return;
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        setResult({ key, state: { status: "error" } });
        return;
      }
      if (cancelled) return;
      const transfers = asTransfers(data);
      if (transfers === null) {
        setResult({ key, state: { status: "error" } });
        return;
      }
      setResult({ key, state: { status: "loaded", transfers } });
    })();
    return () => {
      cancelled = true;
    };
  }, [listId, available]);

  const state: SimplifyState = result.key === requestKey ? result.state : { status: "loading" };

  if (!available || state.status === "blocked") {
    return (
      <p role="status" className="m-0 min-w-0 text-muted" style={{ fontFamily: "var(--type-meta-face)" }}>
        {messages.blockedLabel}
      </p>
    );
  }

  if (state.status === "loading") return null;

  if (state.status === "error") {
    return (
      <p role="alert" className="m-0 min-w-0 text-owe" style={{ fontFamily: "var(--type-meta-face)" }}>
        {messages.errorGeneric}
      </p>
    );
  }

  return (
    <SimplifyPanel
      transfers={state.transfers}
      messages={{
        title: messages.title,
        copyLabel: messages.copyLabel,
        copiedLabel: messages.copiedLabel,
      }}
    />
  );
}
