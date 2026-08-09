"use client";

import { FormEvent, useId, useRef, useState } from "react";

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
};

export function InviteForm({ listId, messages }: Props) {
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const emailId = `${baseId}-email`;
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
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
    <section className={styles.detailSection} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.sectionTitle}>
        {messages.inviteTitle}
      </h2>
      {sent ? (
        <p className={styles.copy} role="status">
          {messages.inviteSent}
        </p>
      ) : null}
      <form className={styles.createForm} onSubmit={onSubmit}>
        <div className={styles.createRow}>
          <div className={styles.createField}>
            <label className={styles.label} htmlFor={emailId}>
              {messages.inviteLabel}
              <input
                id={emailId}
                className={styles.input}
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                disabled={pending}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSent(false);
                  setError(null);
                }}
              />
            </label>
          </div>
          <button className={styles.primary} type="submit" disabled={pending}>
            {pending ? messages.inviteSending : messages.inviteSubmit}
          </button>
        </div>
        {/* Reserve error height so the mobile sheet does not grow/scroll when an alert appears. */}
        <div className={styles.inviteErrorSlot} aria-live="polite">
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
