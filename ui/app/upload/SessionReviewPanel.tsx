"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { CloseIcon, SaveIcon, SpinnerIcon } from "@/app/icons";
import { IconButton } from "@/components/IconButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { uploadCopy } from "@/lib/i18n/upload";
import { useCardIdentification } from "@/hooks/useCardIdentification";
import { fetchCards, type CardItem, type CardsClientMessages } from "@/app/cards/cardsClient";
import { CreditCardFace, CreditCardMark } from "./CreditCardFace";
import { classifyActiveImportSession } from "./classifyActiveImportSession";
import { DiscardConfirmDialog } from "./DiscardConfirmDialog";
import {
  discardSession,
  fetchImportSession,
  type CardIdentificationMessages,
  type ImportSession,
  type StagedStatement,
  type UploadMessages,
} from "./uploadClient";

/**
 * Session-wide auto-routing (Story 4.19): once every statement's card is
 * identified, route straight past the Assign/Review choice when the
 * evidence agrees — any "review"-routed card always wins (safest default),
 * a unanimous "fixed" routing to the same list sends the whole session
 * straight to Bulk pre-filled with that list. Anything else (no cards
 * matched, mixed fixed lists, cards still loading) falls back to letting
 * the user pick, unchanged.
 */
function sessionAutoRoute(
  statements: readonly StagedStatement[],
  identifiedCardByStatement: ReadonlyMap<string, string | null>,
  cardsById: ReadonlyMap<string, CardItem> | null,
): { kind: "fixed"; listId: string } | { kind: "review" } | { kind: "undetermined" } {
  if (cardsById === null) return { kind: "undetermined" };
  const matchedCardIds = new Set<string>();
  for (const statement of statements) {
    const cardId = identifiedCardByStatement.get(statement.id);
    if (cardId === undefined) return { kind: "undetermined" };
    if (cardId !== null) matchedCardIds.add(cardId);
  }
  if (matchedCardIds.size === 0) return { kind: "undetermined" };

  let fixedListId: string | null | undefined;
  for (const cardId of matchedCardIds) {
    const card = cardsById.get(cardId);
    if (!card || card.routing_mode === "review") return { kind: "review" };
    if (fixedListId === undefined) {
      fixedListId = card.fixed_list_id;
    } else if (fixedListId !== card.fixed_list_id) {
      return { kind: "undetermined" };
    }
  }
  return fixedListId ? { kind: "fixed", listId: fixedListId } : { kind: "undetermined" };
}

type SessionReviewPanelProps = {
  session: ImportSession;
  onSessionChanged?: (session: ImportSession) => void;
  onDiscarded?: () => void;
};

const statementCardClass = "relative flex w-full max-w-[26rem] flex-col items-stretch gap-3";
const assignPrimaryClass =
  "inline-flex items-center justify-center px-3 py-[9px] rounded-sm border-none bg-accent text-on-accent no-underline font-[550] text-[0.95rem]";
const reviewSecondaryClass =
  "inline-flex items-center justify-center px-3 py-[9px] rounded-sm border border-accent bg-transparent text-accent no-underline font-[550] text-[0.95rem]";

export function SessionReviewPanel({
  session,
  onSessionChanged,
  onDiscarded,
}: SessionReviewPanelProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const router = useRouter();
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [cardLabelInput, setCardLabelInput] = useState<string>("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [cardsById, setCardsById] = useState<Map<string, CardItem> | null>(null);
  const [identifiedCardByStatement, setIdentifiedCardByStatement] = useState<
    Map<string, string | null>
  >(() => new Map());
  const kind = classifyActiveImportSession(session);
  const needsRetentionWarning = kind === "partial" || kind === "sheet-waiting";

  const messages: UploadMessages = {
    errorUnsupportedFileType: t.errorUnsupportedFileType,
    errorUnknownStatement: t.errorUnknownStatement,
    errorAmbiguousStatement: t.errorAmbiguousStatement,
    errorUnreadableStatement: t.errorUnreadableStatement,
    errorDuplicateStatement: t.errorDuplicateStatement,
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

  // Cards' routing_mode/fixed_list_id (Story 4.19) drive session-wide
  // auto-routing below — fetched once, best-effort: a failure just leaves
  // cardsById null, which sessionAutoRoute treats as "undetermined" and
  // falls back to the existing Assign/Review choice.
  useEffect(() => {
    let cancelled = false;
    const cardsMessages: CardsClientMessages = {
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
      errorInvalidLabel: t.errorGeneric,
      errorInvalidIban: t.errorGeneric,
      errorDuplicateIban: t.errorGeneric,
    };
    fetchCards(cardsMessages).then((result) => {
      if (cancelled) return;
      if (result.ok) setCardsById(new Map(result.cards.map((card) => [card.id, card])));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const reportIdentifiedCard = useCallback((statementId: string, cardId: string | null) => {
    setIdentifiedCardByStatement((prev) => {
      if (prev.get(statementId) === cardId) return prev;
      const next = new Map(prev);
      next.set(statementId, cardId);
      return next;
    });
  }, []);

  const autoRoute =
    kind === "untouched"
      ? sessionAutoRoute(session.statements, identifiedCardByStatement, cardsById)
      : { kind: "undetermined" as const };

  useEffect(() => {
    if (autoRoute.kind === "fixed") {
      router.replace(
        `/upload/bulk/${encodeURIComponent(session.id)}?listId=${encodeURIComponent(autoRoute.listId)}`,
      );
    } else if (autoRoute.kind === "review") {
      router.replace(`/upload/review/${encodeURIComponent(session.id)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRoute.kind, autoRoute.kind === "fixed" ? autoRoute.listId : null, session.id]);

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

  function requestDiscard() {
    if (needsRetentionWarning) {
      setConfirmDiscard(true);
      return;
    }
    discard.submit(session.id);
  }

  const reviewHref = `/upload/review/${encodeURIComponent(session.id)}`;

  if (kind !== "untouched") {
    return (
      <section
        aria-label={t.cardIdentificationTitle}
        className="flex min-h-full w-full flex-1 flex-col items-center justify-center"
      >
        <div className="flex w-full max-w-[26rem] flex-col items-stretch gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={reviewHref} className={assignPrimaryClass}>
              {t.resumeReview}
            </Link>
            <button
              type="button"
              className={reviewSecondaryClass}
              disabled={discard.pending}
              onClick={requestDiscard}
            >
              {discard.pending ? t.closing : t.close}
            </button>
          </div>
          {discard.error ? (
            <p className="text-owe text-[0.9rem] m-0" role="alert">
              {discard.error}
            </p>
          ) : null}
        </div>
        <DiscardConfirmDialog
          open={confirmDiscard}
          title={t.discardConfirmTitle}
          body={t.discardConfirmBody}
          confirmLabel={t.discardConfirmAction}
          cancelLabel={t.discardCancel}
          pending={discard.pending}
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            discard.submit(session.id);
          }}
        />
      </section>
    );
  }

  if (autoRoute.kind === "fixed" || autoRoute.kind === "review") {
    return (
      <section
        aria-label={t.cardIdentificationTitle}
        className="flex min-h-full w-full flex-1 flex-col items-center justify-center"
      >
        <span
          className="grid size-8 place-items-center text-muted"
          aria-label={t.cardIdentificationTitle}
          aria-busy="true"
        >
          <SpinnerIcon className="size-8 animate-spin motion-reduce:animate-none" />
        </span>
      </section>
    );
  }

  return (
    <section
      aria-label={t.cardIdentificationTitle}
      className="flex min-h-full w-full flex-1 flex-col items-center justify-center"
    >
      <ul className="m-0 mb-4 flex w-full max-w-[26rem] list-none flex-col items-stretch gap-3 p-0">
        {session.statements.map((statement) => (
          <StatementCard
            key={statement.id}
            statement={statement}
            sessionId={session.id}
            assignHref={`/upload/bulk/${encodeURIComponent(session.id)}`}
            reviewHref={reviewHref}
            onRegistered={refreshSession}
            onCardIdentified={reportIdentifiedCard}
            onDiscard={requestDiscard}
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
      <DiscardConfirmDialog
        open={confirmDiscard}
        title={t.discardConfirmTitle}
        body={t.discardConfirmBody}
        confirmLabel={t.discardConfirmAction}
        cancelLabel={t.discardCancel}
        pending={discard.pending}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          discard.submit(session.id);
        }}
      />
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
  reviewHref: string;
  onRegistered: () => void;
  onCardIdentified: (statementId: string, cardId: string | null) => void;
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
  reviewHref,
  onRegistered,
  onCardIdentified,
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

  // Reports this statement's resolved card (or null, when it carries none)
  // up to the session-wide auto-router once identification settles — not
  // while still loading or awaiting registration (Story 4.19).
  useEffect(() => {
    if (card.loading || needsRegistration) return;
    onCardIdentified(statement.id, card.cardId ?? null);
  }, [card.loading, needsRegistration, card.cardId, statement.id, onCardIdentified]);

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
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={assignHref} className={assignPrimaryClass}>
            {t.assignToList}
          </Link>
          <Link href={reviewHref} className={reviewSecondaryClass}>
            {t.reviewIndividually}
          </Link>
        </div>
      ) : null}
    </li>
  );
}
