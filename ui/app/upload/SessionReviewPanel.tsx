"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";

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
const cardUnknownClass = `${cardInfoClass} text-muted`;
const cardIbanClass = `${cardInfoClass} text-[0.8rem] text-muted`;

export function SessionReviewPanel({
  session,
  onSessionChanged,
  onDiscarded,
}: SessionReviewPanelProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const inputId = useId();
  const [expandedStatementId, setExpandedStatementId] = useState<string | null>(null);
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
    <section aria-label="Review identified cards">
      <h2 className="mb-[1.25rem] text-[1.25rem] font-[550] text-foreground">
        {t.cardIdentificationTitle}
      </h2>

      <ul className="list-none m-0 p-0 flex flex-col gap-3 mb-4">
        {session.statements.map((statement) => (
          <StatementCard
            key={statement.id}
            statement={statement}
            sessionId={session.id}
            isExpanded={expandedStatementId === statement.id}
            onToggleExpand={() =>
              setExpandedStatementId(expandedStatementId === statement.id ? null : statement.id)
            }
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

      <div className="flex gap-3">
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
  statement: any;
  sessionId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
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
  isExpanded,
  onToggleExpand,
  onRegistered,
  cardMessages,
  registrationError,
  setRegistrationError,
  cardLabelInput,
  setCardLabelInput,
  t,
}: StatementCardProps) {
  const card = useCardIdentification(sessionId, statement, cardMessages);
  const [registering, setRegistering] = useState(false);

  async function handleRegisterCard() {
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

  const needsRegistration = statement.iban && !statement.card_id;

  return (
    <li className={statementCardClass}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="m-0 font-[550] text-foreground text-[0.95rem]">{statement.product_id}</p>

          {statement.card_id && card.cardLabel ? (
            <p className={cardLabelClass}>{`From your ${card.cardLabel} card`}</p>
          ) : needsRegistration ? (
            <p className={cardUnknownClass}>{t.cardIdentificationUnknown}</p>
          ) : statement.iban ? (
            <p className={cardUnknownClass}>{t.cardIdentificationUnknown}</p>
          ) : (
            <p className={cardUnknownClass}>No card info</p>
          )}

          {statement.iban ? (
            <p className={cardIbanClass}>
              {t.cardIdentificationIban}: {statement.iban}
            </p>
          ) : null}
        </div>

        {needsRegistration && !isExpanded ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="py-[6px] px-[12px] rounded-sm border border-border bg-surface text-foreground font-[550] text-[0.85rem] hover:bg-muted transition-colors"
          >
            Register
          </button>
        ) : null}
      </div>

      {isExpanded && needsRegistration ? (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={cardLabelInput}
              onChange={(e) => setCardLabelInput(e.target.value)}
              placeholder={t.cardIdentificationLabel}
              disabled={registering || card.loading}
              className="flex-1 px-3 py-[6px] rounded-sm border border-border bg-background text-foreground placeholder:text-muted text-[0.9rem] disabled:opacity-55"
            />
            <button
              type="button"
              onClick={handleRegisterCard}
              disabled={!cardLabelInput.trim() || registering || card.loading}
              className="py-[6px] px-[12px] rounded-sm bg-accent text-on-accent font-[550] text-[0.85rem] hover:opacity-90 disabled:opacity-55 transition-opacity"
            >
              {registering || card.loading ? t.cardIdentificationRegistering : t.cardIdentificationRegister}
            </button>
          </div>

          {registrationError || card.error ? (
            <p className="text-owe text-[0.85rem] m-0">{registrationError || card.error}</p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
