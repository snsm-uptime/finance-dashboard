"use client";

import { FormEvent, useId, useRef, useState } from "react";

import { FormIconField } from "./FormIconSubmit";
import { inviteMember, type ListsClientMessages } from "./listsClient";
import styles from "./lists.module.css";

export type InviteFormMessages = ListsClientMessages & {
  inviteTitle: string;
  inviteLabel: string;
  inviteSubmit: string;
  inviteSending: string;
  inviteSent: string;
};

type Props = {
  listId: string;
  messages: InviteFormMessages;
  /** When true, keep a fixed error slot so a mobile sheet does not grow when an alert appears. */
  reserveErrorHeight?: boolean;
};

export function InviteForm({ listId, messages, reserveErrorHeight = false }: Props) {
  const baseId = useId();
  const emailId = `${baseId}-email`;
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const canSubmit = email.trim().length > 0 && !pending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current || !email.trim()) return;
    pendingRef.current = true;
    setError(null);
    setPending(true);
    const submitted = String(new FormData(event.currentTarget).get("email") ?? email);
    try {
      const result = await inviteMember(listId, submitted, messages);
      if (!result.ok) {
        setSent(false);
        setError(result.error);
        return;
      }
      setSent(true);
      setEmail("");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form className={styles.createForm} onSubmit={onSubmit}>
      <FormIconField
        id={emailId}
        submitLabel={pending ? messages.inviteSending : messages.inviteSubmit}
        variant="send"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        placeholder="person@home.com"
        required
        value={email}
        disabled={pending}
        submitDisabled={!canSubmit}
        onChange={(e) => {
          setEmail(e.target.value);
          setSent(false);
          setError(null);
        }}
      />
      {sent ? (
        <p className={styles.copy} role="status">
          {messages.inviteSent}
        </p>
      ) : null}
      {/* Optional reserved height: mobile sheet only (desktop sidebar should not grow for empty alerts). */}
      <div
        className={reserveErrorHeight ? styles.inviteErrorSlot : undefined}
        aria-live="polite"
      >
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
