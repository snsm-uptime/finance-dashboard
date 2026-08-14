"use client";

import { FormEvent, useId, useState } from "react";

import { useFormSubmission } from "@/hooks";
import { FormIconField } from "@/components/FormIconSubmit";
import { inviteMember, type ListsClientMessages } from "./listsClient";
import styles from "./lists.module.scss";

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
  /** When true, remove the form border and padding to show only the inputs. */
  hideBorder?: boolean;
};

export function InviteForm({ listId, messages, reserveErrorHeight = false, hideBorder = false }: Props) {
  const baseId = useId();
  const emailId = `${baseId}-email`;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const { pending, error, submit, clearError } = useFormSubmission(
    async (emailAddress: string) => {
      const result = await inviteMember(listId, emailAddress, messages);
      if (result.ok) {
        setSent(true);
        setEmail("");
      }
      return result;
    }
  );

  const canSubmit = email.trim().length > 0 && !pending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(false);
    const submitted = String(new FormData(event.currentTarget).get("email") ?? email);
    await submit(submitted);
  }

  return (
    <form className={`${styles.createForm}${hideBorder ? ` ${styles.createFormNoBorder}` : ""}`} onSubmit={onSubmit}>
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
          clearError();
        }}
      />
      {sent ? (
        <p className={styles.copy} role="status">
          {messages.inviteSent}
        </p>
      ) : (
        /* Optional reserved height: mobile sheet only (desktop sidebar should not grow for empty alerts). */
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
      )}
    </form>
  );
}
