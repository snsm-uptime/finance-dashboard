"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import Link from "next/link";

import { CloseIcon, SaveIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { uploadCopy } from "@/lib/i18n/upload";
import { useCardIdentification } from "@/hooks/useCardIdentification";
import { CreditCardFace, CreditCardMark } from "./CreditCardFace";
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

const statementCardClass = "relative flex flex-col gap-3 max-w-md";
const assignPrimaryClass =
  "inline-flex items-center justify-center self-start px-3 py-[9px] rounded-sm border-none bg-accent text-on-accent no-underline font-[550] text-[0.95rem]";

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
      errorRowNotFound: t.errorGeneric,
      errorRowNotAvailable: t.errorGeneric,
      errorNothingToUndo: t.errorGeneric,
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
            assignHref={`/upload/bulk/${encodeURIComponent(session.id)}`}
            onRegistered={refreshSession}
            onDiscard={() => discard.submit(session.id)}
            discardPending={discard.pending}
            cardMessages={cardMessages}
            registrationError={registrationError}
            setRegistrationError={setRegistrationError}
            cardLabelInput={cardLabelInput}
            setCardLabelInput={setCardLabelInput}
            t={t}
          />
        ))}
      </ul>

      {discard.error ? (
        <p className="text-owe text-[0.9rem] m-0" role="alert">
          {discard.error}
        </p>
      ) : null}
    </section>
  );
}

function statementPeriodBounds(statement: StagedStatement): {
  start: string | null;
  end: string | null;
} {
  let start: string | null = null;
  let end: string | null = null;
  for (const row of statement.rows) {
    const posted = row.posted_date;
    if (!posted) continue;
    if (start === null || posted < start) start = posted;
    if (end === null || posted > end) end = posted;
  }
  return { start, end };
}

type StatementCardProps = {
  statement: StagedStatement;
  sessionId: string;
  assignHref: string;
  onRegistered: () => void;
  onDiscard: () => void;
  discardPending: boolean;
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
  assignHref,
  onRegistered,
  onDiscard,
  discardPending,
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
  const savedName = card.cardLabel || t.newCardTitle;

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
  const period = statementPeriodBounds(statement);

  const nameSlot = needsRegistration ? (
    <>
      <CreditCardMark />
      <label className="flex items-center gap-1.5 min-w-0 flex-1 rounded-[6px] border border-white/70 bg-white/8 py-1 px-2">
        <span className="sr-only">{t.cardIdentificationLabel}</span>
        <input
          id={labelId}
          type="text"
          name="label"
          value={cardLabelInput}
          onChange={(e) => setCardLabelInput(e.target.value)}
          placeholder={t.newCardTitle}
          disabled={registering || card.loading}
          autoComplete="off"
          maxLength={200}
          className="min-w-0 flex-1 m-0 p-0 border-0 bg-transparent text-white text-[0.78rem] font-semibold uppercase tracking-[0.04em] placeholder:text-white/55 placeholder:normal-case placeholder:tracking-normal focus:outline-none disabled:opacity-55"
        />
        <IconButton
          className="w-7 h-7 min-w-7 !p-0 text-white hover:text-white"
          type="submit"
          disabled={!canSave}
          label={registering || card.loading ? t.cardIdentificationRegistering : t.cardIdentificationRegister}
          icon={<SaveIcon className="block w-4 h-4" />}
        />
      </label>
    </>
  ) : (
    <>
      <CreditCardMark />
      <p className="m-0 min-w-0 truncate text-[0.78rem] font-semibold uppercase tracking-[0.06em]">
        {savedName}
      </p>
    </>
  );

  const face = (
    <CreditCardFace
      cardName={nameSlot}
      iban={statement.iban}
      filename={statement.filename}
      periodStart={period.start}
      periodEnd={period.end}
      periodLabel={t.cardPeriodLabel}
      cornerAction={
        <IconButton
          className="w-8 h-8 min-w-8 text-white hover:text-white"
          variant="ghost"
          disabled={discardPending}
          label={discardPending ? t.closing : t.close}
          onClick={onDiscard}
          icon={<CloseIcon className="block w-5 h-5" />}
        />
      }
    />
  );

  return (
    <li className={statementCardClass}>
      {needsRegistration ? (
        <form className="m-0" onSubmit={handleRegisterCard}>
          {face}
        </form>
      ) : (
        face
      )}

      {registrationError || card.error ? (
        <p className="text-owe text-[0.85rem] m-0">{registrationError || card.error}</p>
      ) : null}

      {!needsRegistration ? (
        <div className="flex flex-wrap gap-2">
          <Link href={assignHref} className={assignPrimaryClass}>
            {t.assignToList}
          </Link>
        </div>
      ) : null}
    </li>
  );
}
