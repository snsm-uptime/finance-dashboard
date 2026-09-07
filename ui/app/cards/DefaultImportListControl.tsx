"use client";

import { useEffect, useId, useState } from "react";

import { SingleChipPicker } from "@/components/ChipPicker";
import type { ListItem } from "../lists/listsClient";
import { setDefaultImportList } from "../lists/listsClient";

export type DefaultImportListMessages = {
  defaultListTitle: string;
  errorGeneric: string;
  errorUnauthorized: string;
  errorForbidden: string;
};

type Props = {
  lists: ListItem[];
  messages: DefaultImportListMessages;
  /** Fires after the destination is saved — the API resets all cards to review, so callers refresh routing UI. */
  onChanged?: (listId: string) => void;
};

/** Configurable review-routing default destination list (Story 4.3, FR-12). */
export function DefaultImportListControl({ lists, messages, onChanged }: Props) {
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

  // Membership can drop the previously-loaded default out of `lists` —
  // derive instead of syncing via effect so a stale id never renders as
  // selected.
  const activeListId = lists.some((list) => list.id === listId) ? listId : "";

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
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChanged?.(nextListId);
  }

  return (
    <section aria-labelledby={titleId}>
      <h2
        id={titleId}
        className="m-0 mb-[0.6rem] text-[0.72rem] font-[550] text-muted tracking-[0.02rem]"
      >
        {messages.defaultListTitle}
      </h2>
      <SingleChipPicker
        ariaLabel={messages.defaultListTitle}
        selectedValue={activeListId}
        disabled={pending}
        options={lists.map((l) => ({ value: l.id, label: l.name }))}
        onSelect={onChange}
        error={error}
      />
    </section>
  );
}
