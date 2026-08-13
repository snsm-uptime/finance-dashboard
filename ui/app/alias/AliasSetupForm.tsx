"use client";

import { FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { AliasMessages } from "@/lib/i18n/alias";

import { normalizeAliasInput, setAlias } from "./aliasClient";
import styles from "../signup/signup.module.scss";

const ALIAS_PATTERN = /^[a-z0-9_]{3,32}$/;

type Props = {
  messages: AliasMessages;
  /** Where to land after the claim succeeds (already sanitized on the server). */
  continueHref: string;
};

/**
 * Shared alias setup surface — used by the post-verify path and the
 * first-visit gate so both flows collect the alias the same way.
 */
export function AliasSetupForm({ messages, continueHref }: Props) {
  const router = useRouter();
  const baseId = useId();
  const inputId = `${baseId}-alias`;
  const errorId = `${baseId}-error`;
  const hintId = `${baseId}-hint`;

  const [alias, setAliasValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setPending(true);
    try {
      const normalized = normalizeAliasInput(alias);
      if (!ALIAS_PATTERN.test(normalized)) {
        setError(messages.errorInvalid);
        return;
      }
      const result = await setAlias(normalized, messages);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(continueHref);
      router.refresh();
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label className={styles.label} htmlFor={inputId}>
        {messages.label}
        <input
          id={inputId}
          className={styles.input}
          name="alias"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={32}
          value={alias}
          disabled={pending}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          onChange={(e) => {
            setAliasValue(e.target.value);
            setError(null);
          }}
        />
        <span className={styles.hint} id={hintId}>
          {messages.hint}
        </span>
      </label>
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button className={styles.submit} type="submit" disabled={pending}>
        {pending ? messages.saving : messages.submit}
      </button>
    </form>
  );
}
