"use client";

import { ChangeEvent, FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { encodeAvatarPhoto } from "@/lib/imageEncode";
import type { AliasMessages } from "@/lib/i18n/alias";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";

import { normalizeAliasInput, setAlias, setPhoto } from "./aliasClient";
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
  const [aliasClaimed, setAliasClaimed] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputId = `${baseId}-photo`;

  async function onPhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      setPhotoBase64(await encodeAvatarPhoto(file));
    } catch {
      setPhotoError(messages.errorPhotoInvalid);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError(null);
    setPhotoError(null);
    setPending(true);
    try {
      if (!aliasClaimed) {
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
        setAliasClaimed(true);
      }
      if (photoBase64) {
        // The alias claim (the required step) already succeeded — a photo
        // failure here does not lose that. Surface it and let the user
        // retry, pick another photo, or remove it and resubmit to continue.
        const photoResult = await setPhoto(photoBase64, messages);
        if (!photoResult.ok) {
          setPhotoError(photoResult.error);
          return;
        }
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
      <label className={styles.label} htmlFor={photoInputId}>
        {messages.photoLabel}
        <div className="flex items-center gap-3">
          <Avatar alias={alias || null} seed={alias || "preview"} photoBase64={photoBase64} size="md" />
          <input
            id={photoInputId}
            type="file"
            accept="image/png,image/jpeg"
            disabled={pending}
            onChange={(e) => void onPhotoChange(e)}
          />
          {photoBase64 ? (
            <button
              type="button"
              className={styles.hint}
              disabled={pending}
              onClick={() => setPhotoBase64(null)}
            >
              {messages.photoRemove}
            </button>
          ) : null}
        </div>
        <span className={styles.hint}>{messages.photoHint}</span>
      </label>
      {photoError ? (
        <p className={styles.error} role="alert">
          {photoError}
        </p>
      ) : null}
      <PrimaryButton type="submit" disabled={pending} loading={pending}>
        {pending ? messages.saving : messages.submit}
      </PrimaryButton>
    </form>
  );
}
