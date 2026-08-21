"use client";

import { useEffect, useId, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDrag } from "@use-gesture/react";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { fetchLists, type ListItem } from "@/app/lists/listsClient";
import { uploadCopy } from "@/lib/i18n/upload";
import { useCardIdentification } from "@/hooks/useCardIdentification";
import {
  commitIndividualStatement,
  discardSession,
  fetchImportSession,
  skipStatement,
  type CardIdentificationMessages,
  type ImportSession,
  type IndividualReviewMessages,
  type StagedStatement,
  type UploadMessages,
} from "../../uploadClient";

type IndividualReviewPanelProps = {
  sessionId: string;
};

type Action = { kind: "acceptChosen" } | { kind: "acceptDefault" } | { kind: "skip" };

const SWIPE_DISTANCE_THRESHOLD = 80;

function nextReviewable(session: ImportSession | null): StagedStatement | null {
  if (!session || session.discarded_at) return null;
  return (
    session.statements.find((s) => s.status === "staged" || s.status === "failed") ?? null
  );
}

/**
 * Individual review — phone swipe / desktop buttons (Story 4.8, AC #1-#6).
 * Server (GET session) is the source of truth for which statement is next —
 * client state is never trusted across a reload.
 */
export function IndividualReviewPanel({ sessionId }: IndividualReviewPanelProps) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const router = useRouter();
  const selectId = useId();
  const cardRef = useRef<HTMLDivElement>(null);

  const [session, setSession] = useState<ImportSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [lists, setLists] = useState<ListItem[] | null>(null);
  const [listsError, setListsError] = useState<string | null>(null);
  const [defaultListId, setDefaultListId] = useState<string>("");
  const [pickedListId, setPickedListId] = useState<string>("");
  const [lastAcceptedListId, setLastAcceptedListId] = useState<string | null>(null);
  const [isCoarsePointer] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );
  const [cardLabelInput, setCardLabelInput] = useState<string>("");
  const [registering, setRegistering] = useState(false);

  const messages: IndividualReviewMessages = {
    errorForbidden: t.individualReviewErrorForbidden,
    errorSessionNotFound: t.individualReviewErrorSessionNotFound,
    errorStatementNotFound: t.individualReviewErrorStatementNotFound,
    errorSessionDiscarded: t.individualReviewErrorSessionDiscarded,
    errorStatementNotAvailable: t.individualReviewErrorStatementNotAvailable,
    errorFxUnavailable: t.individualReviewErrorFxUnavailable,
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

  const dismissMessages: UploadMessages = {
    errorUnsupportedFileType: t.errorUnsupportedFileType,
    errorUnknownStatement: t.errorUnknownStatement,
    errorAmbiguousStatement: t.errorAmbiguousStatement,
    errorUnreadableStatement: t.errorUnreadableStatement,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchImportSession(sessionId, messages);
      if (cancelled) return;
      if (!result.ok) {
        setSessionError(result.error);
        return;
      }
      setSessionError(null);
      setSession(result.session);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const result = await fetchLists({
        errorGeneric: t.errorGeneric,
        errorInvalidName: t.errorGeneric,
        errorForbidden: t.individualReviewErrorForbidden,
        errorUnauthorized: t.errorUnauthorized,
      });
      if (cancelled) return;
      if (!result.ok) {
        setListsError(result.error);
        return;
      }
      setLists(result.lists);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { default_import_list_id?: string | null } | null) => {
        if (cancelled || !data) return;
        setDefaultListId(data.default_import_list_id ?? "");
      })
      .catch(() => {
        /* default list is a convenience — a failed read just disables that action */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = nextReviewable(session);
  const card = useCardIdentification(sessionId, current, cardMessages);

  const action = useFormSubmission(async (act: Action) => {
    if (!current) return { ok: false, error: t.errorGeneric };

    if (act.kind === "skip") {
      const result = await skipStatement(sessionId, current.id, messages);
      if (result.ok) {
        setSession(result.session);
        setPickedListId("");
      }
      return result;
    }

    const listId = act.kind === "acceptChosen" ? pickedListId : defaultListId;
    if (!listId) return { ok: false, error: t.errorGeneric };
    // Story 4.8.2: Pass identified card ID to commit (will be set as origin)
    const result = await commitIndividualStatement(
      sessionId,
      current.id,
      listId,
      card.cardId,
      messages,
    );
    if (result.ok) {
      setLastAcceptedListId(listId);
      setPickedListId("");
      setSession(result.session);
    }
    return result;
  });

  const dismiss = useFormSubmission(async () => {
    const result = await discardSession(sessionId, dismissMessages);
    if (result.ok) {
      router.push("/upload");
    }
    return result;
  });

  useEffect(() => {
    if (session && !current) {
      router.push(lastAcceptedListId ? `/lists/${encodeURIComponent(lastAcceptedListId)}` : "/lists");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, current, lastAcceptedListId]);

  const listOptions = useMemo(
    () => (lists ?? []).map((l) => ({ value: l.id, label: l.name })),
    [lists],
  );
  const defaultListName = (lists ?? []).find((l) => l.id === defaultListId)?.name ?? "";
  const chosenListName = (lists ?? []).find((l) => l.id === pickedListId)?.name ?? "";

  // Story 4.8.1: Block accept until card is identified (if IBAN present)
  const cardReadyOrNoIban = !current?.iban || card.cardMatched;
  const canAcceptChosen =
    !!current && current.status === "staged" && !!pickedListId && cardReadyOrNoIban && !card.loading;
  const canAcceptDefault =
    !!current && current.status === "staged" && !!defaultListId && cardReadyOrNoIban && !card.loading;
  const canSkip = !!current && (current.status === "staged" || current.status === "failed");

  useDrag(
    ({ last, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy] }) => {
      if (!last || !isCoarsePointer || action.pending || dismiss.pending) return;
      const absX = Math.abs(mx);
      const absY = Math.abs(my);
      if (absX < SWIPE_DISTANCE_THRESHOLD && absY < SWIPE_DISTANCE_THRESHOLD) return;

      if (absY > absX && dy > 0 && vy > 0) {
        if (canSkip) action.submit({ kind: "skip" });
        return;
      }
      if (dx > 0 && vx > 0) {
        if (canAcceptChosen) action.submit({ kind: "acceptChosen" });
        return;
      }
      if (dx < 0 && vx > 0) {
        if (canAcceptDefault) action.submit({ kind: "acceptDefault" });
      }
    },
    // touch-none + passive: false: the card must recognize its own vertical
    // (down → skip) and horizontal (left/right → accept) gestures, so native
    // browser touch-action handling is fully disabled here rather than left
    // to compete with useDrag on any axis (Story 4.8 review finding).
    { target: cardRef, eventOptions: { passive: false } },
  );

  const progressIndex = session ? session.statements.findIndex((s) => s.id === current?.id) : -1;
  const progressLabel =
    session && current
      ? t.individualReviewProgress
          .replace("{current}", String(progressIndex + 1))
          .replace("{total}", String(session.statements.length))
      : "";

  return (
    <main
      className="min-h-screen py-[2.5rem] px-[1.5rem]"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      <div className="flex items-center justify-between max-w-[28rem] mb-[1.75rem]">
        <h1 className="m-0 text-[1.75rem] font-[550] text-foreground">
          {t.individualReviewTitle}
        </h1>
        {progressLabel ? (
          <span className="text-muted text-[0.85rem]">{progressLabel}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 max-w-[28rem]">
        {sessionError ? (
          <p className="text-owe text-[0.9rem] m-0" role="alert">
            {sessionError}
          </p>
        ) : null}
        {listsError ? (
          <p className="text-owe text-[0.9rem] m-0" role="alert">
            {listsError}
          </p>
        ) : null}

        {current ? (
          <>
            {/* Story 4.8.2: Consolidated card + file info + buttons (compact layout) */}
            <div
              ref={cardRef}
              className="py-[1.25rem] px-[1.1rem] rounded-[10px] border border-border bg-surface touch-none"
            >
              {/* Card identification */}
              <div className="mb-[0.75rem]">
                <p className="m-0 text-[0.75rem] uppercase tracking-[0.05rem] font-[550] text-muted mb-[0.25rem]">
                  Card
                </p>
                {card.loading ? (
                  <p className="m-0 text-[0.95rem] text-muted">{t.cardIdentificationTitle}…</p>
                ) : card.cardMatched && card.cardLabel ? (
                  <p className="m-0 text-[1rem] text-foreground font-[550]">{card.cardLabel}</p>
                ) : card.needsRegistration && card.iban ? (
                  <p className="m-0 text-[1rem] text-owe font-[550]">{t.cardIdentificationUnknown}</p>
                ) : (
                  <p className="m-0 text-[0.95rem] text-muted">{t.individualReviewLoadingSession}</p>
                )}
              </div>

              {/* File information */}
              <div className="mb-[1rem]">
                <p className="m-0 text-[0.9rem] text-muted font-mono">
                  {current.filename || current.product_id}
                  {current.status !== "failed" && ` [${current.candidate_row_count}]`}
                </p>
                {current.status === "failed" ? (
                  <p className="m-0 text-owe text-[0.75rem] mt-[0.25rem]">
                    {t.individualReviewFailedStatement}
                  </p>
                ) : null}
              </div>

              {/* Action buttons - inline */}
              <div className="flex gap-2">
                {defaultListId ? (
                  <button
                    type="button"
                    disabled={!canAcceptDefault || action.pending || dismiss.pending}
                    onClick={() => action.submit({ kind: "acceptDefault" })}
                    className="flex-1 m-0 px-3 py-[8px] rounded-sm border border-accent bg-accent text-surface cursor-pointer font-[550] text-[0.85rem] disabled:opacity-55 disabled:cursor-not-allowed"
                  >
                    {action.pending ? t.individualReviewCommitting : t.individualReviewAcceptDefault.replace("{list}", defaultListName)}
                  </button>
                ) : null}
                {lists !== null && lists.length > 0 ? (
                  <div className="flex-1">
                    <SoftLedgerSelect
                      id={selectId}
                      value={pickedListId}
                      options={[
                        { value: "", label: t.individualReviewChooseList },
                        ...listOptions,
                      ]}
                      onChange={setPickedListId}
                    />
                  </div>
                ) : null}
              </div>

              {/* IBAN display (collapsed inside card) */}
              {card.iban && (
                <div className="mt-[1rem] pt-[1rem] border-t border-border">
                  <p className="m-0 text-[0.75rem] text-muted font-[550] mb-[0.25rem]">
                    {t.cardIdentificationIban}
                  </p>
                  <p className="m-0 text-[0.85rem] text-foreground font-mono">{card.iban}</p>
                </div>
              )}
            </div>

            {/* Card registration form (Story 4.8.1) - only show if card needs registration */}
            {card.needsRegistration && card.iban && (
              <div className="flex flex-col gap-2 py-[1rem] px-[1.1rem] rounded-[10px] border border-border bg-surface">
                <label htmlFor="card-label" className="text-[0.9rem] font-[550] text-foreground">
                  {t.cardIdentificationLabel}
                </label>
                <input
                  id="card-label"
                  type="text"
                  value={cardLabelInput}
                  onChange={(e) => setCardLabelInput(e.currentTarget.value)}
                  placeholder="e.g., My Visa"
                  disabled={registering || card.loading}
                  className="m-0 px-3 py-[9px] rounded-sm border border-border bg-surface text-foreground font-[450] text-[0.95rem] placeholder-muted disabled:opacity-55"
                />
                {card.error && (
                  <p className="m-0 text-owe text-[0.85rem]">{card.error}</p>
                )}
                <button
                  type="button"
                  disabled={!cardLabelInput.trim() || registering || card.loading}
                  onClick={async () => {
                    setRegistering(true);
                    const result = await card.registerCard(cardLabelInput.trim());
                    setRegistering(false);
                    if (result.ok) {
                      setCardLabelInput("");
                    }
                  }}
                  className="m-0 px-3 py-[9px] rounded-sm border border-accent bg-accent text-surface cursor-pointer font-[550] text-[0.95rem] disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {registering ? t.cardIdentificationRegistering : t.cardIdentificationRegister}
                </button>
              </div>
            )}

            {/* Error and loading states */}
            <div aria-live="polite">
              {action.error ? (
                <p className="text-owe text-[0.9rem] m-0" role="alert">
                  {action.error}
                </p>
              ) : null}
              {!defaultListId && !card.needsRegistration ? (
                <p className="text-muted text-[0.8rem] m-0">{t.individualReviewNoDefaultList}</p>
              ) : null}
              {lists !== null && lists.length === 0 ? (
                <p className="text-muted text-[0.85rem] m-0">{t.individualReviewNoLists}</p>
              ) : null}
            </div>

            {/* Primary action for choosing list if no default */}
            {!defaultListId && lists !== null && lists.length > 0 ? (
              <PrimaryButton
                disabled={!canAcceptChosen || action.pending || dismiss.pending}
                onClick={() => action.submit({ kind: "acceptChosen" })}
              >
                {action.pending
                  ? t.individualReviewCommitting
                  : t.individualReviewAcceptChosen.replace(
                      "{list}",
                      chosenListName || t.individualReviewChooseList,
                    )}
              </PrimaryButton>
            ) : null}

            {/* Skip button */}
            <button
              type="button"
              disabled={!canSkip || action.pending || dismiss.pending}
              onClick={() => action.submit({ kind: "skip" })}
              className="m-0 px-3 py-[9px] rounded-sm border-none bg-transparent text-foreground cursor-pointer font-[550] text-[0.95rem] disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {action.pending ? t.individualReviewSkipping : t.individualReviewSkip}
            </button>
          </>
        ) : !session ? (
          <p className="text-muted text-[0.85rem] m-0">{t.individualReviewLoadingSession}</p>
        ) : null}

        <div className="mt-2">
          <button
            type="button"
            disabled={dismiss.pending || action.pending}
            onClick={() => dismiss.submit(undefined)}
            className="m-0 px-3 py-[9px] rounded-sm border border-border bg-transparent text-foreground cursor-pointer font-[550] text-[0.95rem] disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {t.individualReviewDismissFile}
          </button>
          {dismiss.error ? (
            <p className="text-owe text-[0.9rem] mt-2 mb-0" role="alert">
              {dismiss.error}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
