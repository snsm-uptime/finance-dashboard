"use client";

import { useEffect, useId, useState } from "react";

import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import type { ListItem } from "../lists/listsClient";
import { setDefaultImportList } from "../lists/listsClient";

export type DefaultImportListMessages = {
  defaultListTitle: string;
  defaultListHint: string;
  errorGeneric: string;
  errorUnauthorized: string;
  errorForbidden: string;
};

type Props = {
  lists: ListItem[];
  messages: DefaultImportListMessages;
};

/** Configurable review-routing default destination list (Story 4.3, FR-12). */
export function DefaultImportListControl({ lists, messages }: Props) {
  const baseId = useId();
  const titleId = `${baseId}-default-list-title`;
  const [listId, setListId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { default_import_list_id?: string | null } | null) => {
        if (cancelled || !data) return;
        setListId(data.default_import_list_id ?? "");
      })
      .catch(() => {
        /* preference is a convenience default — a failed read leaves the picker blank */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (lists.length === 0) return null;

  async function onChange(nextListId: string) {
    setListId(nextListId);
    setPending(true);
    setError(null);
    const result = await setDefaultImportList(nextListId, {
      errorGeneric: messages.errorGeneric,
      errorInvalidName: messages.errorGeneric,
      errorForbidden: messages.errorForbidden,
      errorUnauthorized: messages.errorUnauthorized,
    });
    setPending(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <section aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]"
      >
        {messages.defaultListTitle}
      </h2>
      <p className="m-0 mb-[0.5rem] text-muted text-[0.85rem]">{messages.defaultListHint}</p>
      <SoftLedgerSelect
        aria-label={messages.defaultListTitle}
        value={listId}
        disabled={pending}
        options={lists.map((l) => ({ value: l.id, label: l.name }))}
        onChange={onChange}
      />
      <div aria-live="polite">
        {error ? (
          <p className="text-owe text-[0.85rem] m-0 mt-1" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
