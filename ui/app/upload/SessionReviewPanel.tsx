"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import Link from "next/link";

import { SaveIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { uploadCopy } from "@/lib/i18n/upload";
import { useCardIdentification } from "@/hooks/useCardIdentification";
import {
  discardSession,
  fetchImportSession,
  type CardIdentificationMessages,
  type ImportSession,
  type StagedStatement,
  type UploadMessages,
} from "./uploadClient";

type SessionReviewPanelProps = {
  session: ImportSession;
  onSessionChanged?: (session: ImportSession) => void;
  onDiscarded?: () => void;
};

const statementCardClass =
  "flex flex-col gap-2 py-[0.85rem] px-[0.85rem] rounded-[8px] border border-border bg-surface";
const cardInfoClass = "text-[0.9rem]";
const cardLabelClass = `${cardInfoClass} font-[550] text-foreground`;
const cardIbanClass = `${cardInfoClass} text-[0.8rem] text-muted`;

export function SessionReviewPanel({
  session,
  onSessionChanged,
  onDiscarded,
}: SessionReviewPanelProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [cardLabelInput, setCardLabelInput] = useState<string>("");

  const messages: UploadMessages = {
    errorUnsupportedFileType: t.errorUnsupportedFileType,
    errorUnknownStatement: t.errorUnknownStatement,
    errorAmbiguousStatement: t.errorAmbiguousStatement,
    errorUnreadableStatement: t.errorUnreadableStatement,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  const cardMessages: CardIdentificationMessages = useMemo(
    () => ({
      errorCardAlreadyRegistered: t.errorCardAlreadyRegistered,
      errorInvalidCardLabel: t.errorInvalidCardLabel,
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
    }),
    [t.errorCardAlreadyRegistered, t.errorInvalidCardLabel, t.errorGeneric, t.errorUnauthorized],
  );

  const discard = useFormSubmission(async (sessionId: string) => {
    const result = await discardSession(sessionId, messages);
    if (result.ok) {
      onDiscarded?.();
    }
    return result;
  });

  async function refreshSession() {
    const result = await fetchImportSession(session.id, {
      errorForbidden: t.errorGeneric,
      errorSessionNotFound: t.errorGeneric,
      errorStatementNotFound: t.errorGeneric,
      errorSessionDiscarded: t.errorGeneric,
      errorStatementNotAvailable: t.errorGeneric,
      errorFxUnavailable: t.errorGeneric,
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
    });
    if (result.ok) {
      onSessionChanged?.(result.session);
    }
  }

  return (
    <section aria-label={t.cardIdentificationTitle}>
      <ul className="list-none m-0 p-0 flex flex-col gap-3 mb-4 max-w-[28rem]">
        {session.statements.map((statement) => (
          <StatementCard
            key={statement.id}
            statement={statement}
            sessionId={session.id}
            onRegistered={refreshSession}
            cardMessages={cardMessages}
            registrationError={registrationError}
            setRegistrationError={setRegistrationError}
            cardLabelInput={cardLabelInput}
            setCardLabelInput={setCardLabelInput}
            t={t}
          />
        ))}
      </ul>

      <div className="flex gap-3 max-w-[28rem]">
        <PrimaryButton disabled={discard.pending} onClick={() => discard.submit(session.id)}>
          {discard.pending ? t.discarding : t.discard}
        </PrimaryButton>
        <Link
          href={`/upload/bulk/${encodeURIComponent(session.id)}`}
          className="inline-flex items-center px-3 py-[9px] rounded-sm border border-border text-foreground no-underline font-[550] text-[0.95rem]"
        >
          {t.assignToList}
        </Link>
      </div>

      {discard.error ? (
        <p className="text-owe text-[0.9rem] m-0 mt-3" role="alert">
          {discard.error}
        </p>
      ) : null}
    </section>
  );
}

type StatementCardProps = {
  statement: StagedStatement;
  sessionId: string;
  onRegistered: () => void;
  cardMessages: CardIdentificationMessages;
  registrationError: string | null;
  setRegistrationError: (error: string | null) => void;
  cardLabelInput: string;
  setCardLabelInput: (input: string) => void;
  t: ReturnType<typeof uploadCopy>;
};

function StatementCard({
  statement,
  sessionId,
  onRegistered,
  cardMessages,
  registrationError,
  setRegistrationError,
  cardLabelInput,
  setCardLabelInput,
  t,
}: StatementCardProps) {
  const labelId = useId();
  const card = useCardIdentification(sessionId, statement, cardMessages);
  const [registering, setRegistering] = useState(false);

  const needsRegistration =
    card.needsRegistration ||
    (!card.cardMatched && Boolean(statement.iban) && !statement.card_id);
  const title = needsRegistration
    ? t.newCardTitle
    : statement.filename || card.cardLabel || t.cardIdentificationTitle;

  async function handleRegisterCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cardLabelInput.trim()) return;
    setRegistering(true);
    const result = await card.registerCard(cardLabelInput);
    setRegistering(false);

    if (result.ok) {
      setCardLabelInput("");
      setRegistrationError(null);
      onRegistered();
    } else {
      setRegistrationError(result.error || t.errorGeneric);
    }
  }

  const canSave = cardLabelInput.trim().length > 0 && !registering && !card.loading;

  return (
    <li className={statementCardClass}>
      <div className="flex flex-col gap-1">
        <p className="m-0 font-[550] text-foreground text-[1rem]">{title}</p>

        {statement.card_id && card.cardLabel && !needsRegistration ? (
          <p className={cardLabelClass}>{t.cardIdentificationMatched.replace("{label}", card.cardLabel)}</p>
        ) : null}

        {statement.iban ? (
          <p className={cardIbanClass}>
            {t.cardIdentificationIban}: {statement.iban}
          </p>
        ) : null}
      </div>

      {needsRegistration ? (
        <form className="flex flex-col gap-2 pt-1" onSubmit={handleRegisterCard}>
          <label className="flex flex-col gap-[0.35rem]">
            <span className="sr-only">{t.cardIdentificationLabel}</span>
            <div className="flex items-center gap-2 border border-border rounded-[8px] bg-background py-2 px-[0.65rem] overflow-hidden">
              <input
                id={labelId}
                type="text"
                name="label"
                value={cardLabelInput}
                onChange={(e) => setCardLabelInput(e.target.value)}
                placeholder={t.cardIdentificationLabel}
                disabled={registering || card.loading}
                autoComplete="off"
                maxLength={200}
                className="flex-1 min-w-0 m-0 p-0 border-0 bg-transparent text-foreground text-base font-normal leading-[1.4] placeholder:text-muted placeholder:opacity-60 focus:outline-none disabled:opacity-55"
              />
              <IconButton
                className="w-7 h-7 min-w-7 !p-0 !rounded-[4px] enabled:hover:!text-accent enabled:hover:!bg-transparent"
                type="submit"
                disabled={!canSave}
                label={registering || card.loading ? t.cardIdentificationRegistering : t.cardIdentificationRegister}
                icon={<SaveIcon className="block w-5 h-5" />}
              />
            </div>
          </label>

          {registrationError || card.error ? (
            <p className="text-owe text-[0.85rem] m-0">{registrationError || card.error}</p>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}
