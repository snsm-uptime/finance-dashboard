"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useDrag } from "@use-gesture/react";

import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { fetchLists, type ListItem } from "@/app/lists/listsClient";
import { uploadCopy } from "@/lib/i18n/upload";
import { useCardIdentification } from "@/hooks/useCardIdentification";
import {
  assignRow,
  deleteRow,
  discardSession,
  editRowDescription,
  fetchImportSession,
  undoLastResolution,
  type CandidateRow,
  type CardIdentificationMessages,
  type ImportSession,
  type IndividualReviewMessages,
  type StagedStatement,
  type UploadMessages,
} from "../../uploadClient";

type IndividualReviewPanelProps = {
  sessionId: string;
};

type Action =
  | { kind: "acceptChosen" }
  | { kind: "acceptDefault" }
  | { kind: "delete" }
  | { kind: "undo" };

type TitleState = "idle" | "primed" | "editing";

const SWIPE_DISTANCE_THRESHOLD = 80;
// Mirrors api/domain/expenses.py:20 (normalize_row_description) — display-side
// guard only, the server is the actual enforcement point.
const DESCRIPTION_MAX_LENGTH = 500;

/**
 * Flattens statements → rows (statement order, then sequence order — the GET
 * contract already returns rows pending-only and sequence-ordered, so no
 * client-side filter/sort is needed) and returns the first pair. A `failed`
 * statement carries an empty `rows` array and so simply contributes nothing.
 */
export function nextReviewableRow(
  session: ImportSession | null,
): { row: CandidateRow; statement: StagedStatement } | null {
  if (!session || session.discarded_at) return null;
  for (const statement of session.statements) {
    if (statement.rows.length > 0) {
      return { row: statement.rows[0], statement };
    }
  }
  return null;
}

// No utility formats a raw (amount, currency) pair for arbitrary currencies —
// display-only, mirrors the existing `formatCardBalance` use of `Number()` for
// rendering (never for computation, comparison, or the assign/PATCH payloads).
function formatRowAmount(amount: string, currency: string): string {
  const parsed = Number(amount);
  const display = Number.isFinite(parsed)
    ? parsed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : amount;
  return `${currency} ${display}`;
}

/**
 * Individual review — one transaction at a time, four directional actions
 * (Story 4.13). Server (GET session) is the source of truth for which row is
 * next — client state is never trusted across a reload.
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
  const [isCoarsePointer] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );
  const [cardLabelInput, setCardLabelInput] = useState<string>("");
  const [registering, setRegistering] = useState(false);

  const titleContainerRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleSubmittingRef = useRef(false);
  const lastRowIdRef = useRef<string | undefined>(undefined);
  const [titleState, setTitleState] = useState<TitleState>("idle");
  const [titleDraft, setTitleDraft] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [titleSubmitting, setTitleSubmitting] = useState(false);

  const messages: IndividualReviewMessages = {
    errorForbidden: t.individualReviewErrorForbidden,
    errorSessionNotFound: t.individualReviewErrorSessionNotFound,
    errorStatementNotFound: t.individualReviewErrorStatementNotFound,
    errorSessionDiscarded: t.individualReviewErrorSessionDiscarded,
    errorStatementNotAvailable: t.individualReviewErrorStatementNotAvailable,
    errorRowNotFound: t.individualReviewErrorRowNotFound,
    errorRowNotAvailable: t.individualReviewErrorRowNotAvailable,
    errorNothingToUndo: t.individualReviewErrorNothingToUndo,
    errorSessionHasPendingRows: t.individualReviewErrorSessionHasPendingRows,
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

  const current = nextReviewableRow(session);
  const card = useCardIdentification(sessionId, current?.statement ?? null, cardMessages);

  const action = useFormSubmission(async (act: Action) => {
    if (!current) return { ok: false, error: t.errorGeneric };
    const { row } = current;

    if (act.kind === "delete") {
      const result = await deleteRow(sessionId, row.id, messages);
      if (result.ok) setSession(result.session);
      return result;
    }
    if (act.kind === "undo") {
      const result = await undoLastResolution(sessionId, messages);
      if (result.ok) setSession(result.session);
      return result;
    }

    const listId = act.kind === "acceptChosen" ? pickedListId : defaultListId;
    if (!listId) return { ok: false, error: t.errorGeneric };
    const result = await assignRow(sessionId, row.id, listId, messages);
    if (result.ok) setSession(result.session);
    return result;
  });

  const dismiss = useFormSubmission(async () => {
    const result = await discardSession(sessionId, dismissMessages);
    if (result.ok) {
      router.push("/upload");
    }
    return result;
  });

  const listOptions = useMemo(
    () => (lists ?? []).map((l) => ({ value: l.id, label: l.name })),
    [lists],
  );
  const defaultListName = (lists ?? []).find((l) => l.id === defaultListId)?.name ?? "";
  const chosenListName = (lists ?? []).find((l) => l.id === pickedListId)?.name ?? "";

  // Story 4.8.1 (preserved): block accept until the row's parent statement's
  // card is identified/registered when that statement carries an IBAN.
  const cardReadyOrNoIban = !current?.statement.iban || card.cardMatched;
  const canAcceptChosen = !!current && !!pickedListId && cardReadyOrNoIban && !card.loading;
  const canAcceptDefault = !!current && !!defaultListId && cardReadyOrNoIban && !card.loading;
  // Delete has no card-identification gate — a pending row is always
  // deletable, since delete never touches a list (Task 3.4).
  const canDelete = !!current;
  const canUndo = !!session?.undo;

  useDrag(
    ({ last, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy] }) => {
      if (!last || !isCoarsePointer || action.pending || dismiss.pending) return;
      const absX = Math.abs(mx);
      const absY = Math.abs(my);
      if (absX < SWIPE_DISTANCE_THRESHOLD && absY < SWIPE_DISTANCE_THRESHOLD) return;

      // AD-9 amended 2026-08-20: vertical swipe axis is up → delete; down is
      // never a gesture (undo is button-only on every platform), so there is
      // no branch mapping a downward drag to anything.
      if (absY > absX && dy < 0 && vy > 0) {
        if (canDelete) action.submit({ kind: "delete" });
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
    // (up → delete) and horizontal (left/right → accept) gestures, so native
    // browser touch-action handling is fully disabled here rather than left
    // to compete with useDrag on any axis (Story 4.8 review finding).
    { target: cardRef, eventOptions: { passive: false } },
  );

  // Title edit state resets whenever the reviewed row changes — by any of
  // assign/delete/undo resolving, or a session refresh (AC #8). Adjusted
  // during render (not in an effect) per React's "reset state when a prop
  // changes" pattern — avoids an extra commit-then-reset render pass.
  if (lastRowIdRef.current !== current?.row.id) {
    lastRowIdRef.current = current?.row.id;
    setTitleState("idle");
    setTitleDraft("");
    setTitleError(null);
  }

  useEffect(() => {
    if (titleState !== "editing") return;
    const input = titleInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [titleState]);

  useEffect(() => {
    if (titleState === "idle") return;
    function onPointerDown(event: PointerEvent) {
      const container = titleContainerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) {
        return;
      }
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [titleState]);

  function handleTitleClick() {
    if (!current) return;
    if (titleState === "idle") {
      setTitleDraft(current.row.description);
      setTitleError(null);
      setTitleState("primed");
      return;
    }
    if (titleState === "primed") {
      setTitleState("editing");
    }
  }

  async function commitTitleEdit() {
    if (!current || titleSubmittingRef.current) return;
    const trimmed = titleDraft.trim();
    if (trimmed.length === 0) {
      setTitleError(t.individualReviewErrorEmptyTitle);
      return;
    }
    if (trimmed === current.row.description) {
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
      return;
    }
    setTitleError(null);
    titleSubmittingRef.current = true;
    setTitleSubmitting(true);
    try {
      const result = await editRowDescription(sessionId, current.row.id, trimmed, messages);
      if (!result.ok) {
        if (result.error === messages.errorRowNotAvailable) {
          // Concurrent resolution between prime and commit (AC #9) — refresh
          // from the next GET rather than showing a stale edit.
          const refreshed = await fetchImportSession(sessionId, messages);
          if (refreshed.ok) {
            setSession(refreshed.session);
          } else {
            setSessionError(refreshed.error);
          }
          return;
        }
        setTitleError(result.error);
        return;
      }
      setSession(result.session);
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
    } finally {
      titleSubmittingRef.current = false;
      setTitleSubmitting(false);
    }
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitleEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
    }
  }

  const remainingCount = session
    ? session.statements.reduce((sum, statement) => sum + statement.rows.length, 0)
    : 0;
  const remainingLabel =
    session && current
      ? t.individualReviewProgress.replace("{count}", String(remainingCount))
      : "";

  return (
    <main
      className="fixed inset-0 z-10 flex justify-center overflow-y-auto bg-black/40 px-[1.5rem] py-[2.5rem]"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      <div className="flex w-full max-w-[26rem] flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="m-0 text-[1.5rem] font-[550] text-foreground">
            {t.individualReviewTitle}
          </h1>
          {remainingLabel ? (
            <span className="text-muted text-[0.85rem]">{remainingLabel}</span>
          ) : null}
        </div>

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
            {lists !== null && lists.length > 0 ? (
              <SoftLedgerSelect
                id={selectId}
                value={pickedListId}
                options={[{ value: "", label: t.individualReviewChooseList }, ...listOptions]}
                onChange={setPickedListId}
              />
            ) : null}

            <div className="grid grid-cols-[5.5rem_1fr_5.5rem] grid-rows-[auto_auto_auto] items-center gap-3">
              <div />
              <button
                type="button"
                disabled={!canDelete || action.pending || dismiss.pending}
                onClick={() => action.submit({ kind: "delete" })}
                className="col-start-2 row-start-1 justify-self-center m-0 px-3 py-[6px] rounded-sm border border-border bg-transparent text-foreground cursor-pointer font-[550] text-[0.8rem] disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {action.pending ? t.individualReviewDeleting : t.individualReviewDelete}
              </button>
              <div />

              <button
                type="button"
                disabled={!canAcceptDefault || action.pending || dismiss.pending}
                onClick={() => action.submit({ kind: "acceptDefault" })}
                className="col-start-1 row-start-2 self-center m-0 px-2 py-[8px] rounded-sm border border-accent bg-accent text-surface cursor-pointer font-[550] text-[0.75rem] disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {action.pending
                  ? t.individualReviewCommitting
                  : defaultListId
                    ? t.individualReviewAcceptDefault.replace("{list}", defaultListName)
                    : t.individualReviewNoDefaultListShort}
              </button>

              <div
                ref={cardRef}
                className="col-start-2 row-start-2 flex min-h-[11rem] flex-col justify-between rounded-[12px] border border-border bg-surface p-[1.25rem] shadow-lg touch-none"
              >
                <div
                  ref={titleContainerRef}
                  onClick={handleTitleClick}
                  className={`cursor-text rounded-sm -mx-1 -my-1 px-1 py-1 ${
                    titleState === "primed" ? "border border-accent" : ""
                  }`}
                >
                  {titleState === "editing" ? (
                    <input
                      ref={titleInputRef}
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.currentTarget.value)}
                      onKeyDown={onTitleKeyDown}
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      disabled={titleSubmitting}
                      autoComplete="off"
                      aria-label={t.individualReviewTitleFieldLabel}
                      className="w-full m-0 px-2 py-1 -mx-2 -my-1 rounded-sm border border-accent bg-surface text-foreground font-[550] text-[1.05rem] disabled:opacity-55"
                    />
                  ) : (
                    <h2 className="m-0 text-[1.05rem] font-[550] text-foreground">
                      {current.row.description}
                    </h2>
                  )}
                </div>
                {titleError ? (
                  <p role="alert" className="m-0 mt-1 text-owe text-[0.8rem]">
                    {titleError}
                  </p>
                ) : null}
                {/* Subtitle (store) — no adapter emits a structured merchant
                    field yet, so this slot stays blank until one does. */}
                <div>
                  <p
                    className="m-0 mt-[0.75rem] text-[1.3rem] font-[500] text-foreground"
                    style={{ fontFamily: "var(--font-brand), 'Times New Roman', serif" }}
                  >
                    {formatRowAmount(current.row.amount, current.row.currency)}
                  </p>
                  <p className="m-0 mt-[0.5rem] text-[0.8rem] text-muted">
                    {current.row.posted_date}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={!canAcceptChosen || action.pending || dismiss.pending}
                onClick={() => action.submit({ kind: "acceptChosen" })}
                className="col-start-3 row-start-2 self-center m-0 px-2 py-[8px] rounded-sm border border-accent bg-accent text-surface cursor-pointer font-[550] text-[0.75rem] disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {action.pending
                  ? t.individualReviewCommitting
                  : t.individualReviewAcceptChosen.replace(
                      "{list}",
                      chosenListName || t.individualReviewChooseList,
                    )}
              </button>

              <div />
              <button
                type="button"
                disabled={!canUndo || action.pending || dismiss.pending}
                onClick={() => action.submit({ kind: "undo" })}
                className="col-start-2 row-start-3 justify-self-center m-0 px-3 py-[6px] rounded-sm border border-border bg-transparent text-foreground cursor-pointer font-[550] text-[0.8rem] disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {action.pending ? t.individualReviewUndoing : t.individualReviewUndo}
              </button>
              <div />
            </div>

            {/* Card identification / registration (Story 4.8.1) — subordinate
                to the four-direction card, only relevant when the row's
                parent statement carries an IBAN. */}
            {current.statement.iban ? (
              <>
                <div className="py-[1rem] px-[1.1rem] rounded-[10px] border border-border bg-surface">
                  <p className="m-0 text-[0.7rem] uppercase tracking-[0.05rem] font-[550] text-muted mb-[0.25rem]">
                    {t.cardIdentificationTitle}
                  </p>
                  {card.loading ? (
                    <p className="m-0 text-[0.85rem] text-muted">{t.cardIdentificationTitle}…</p>
                  ) : card.cardMatched && card.cardLabel ? (
                    <p className="m-0 text-[0.9rem] text-foreground font-[550]">
                      {card.cardLabel}
                    </p>
                  ) : card.needsRegistration ? (
                    <p className="m-0 text-[0.9rem] text-foreground font-[550]">
                      {t.newCardTitle}
                    </p>
                  ) : null}
                  {card.iban ? (
                    <p className="m-0 mt-[0.5rem] text-[0.8rem] text-muted font-mono">
                      {t.cardIdentificationIban}: {card.iban}
                    </p>
                  ) : null}
                </div>

                {card.needsRegistration && card.iban ? (
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
                    {card.error && <p className="m-0 text-owe text-[0.85rem]">{card.error}</p>}
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
                ) : null}
              </>
            ) : null}

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
          </>
        ) : !session ? (
          <p className="text-muted text-[0.85rem] m-0">{t.individualReviewLoadingSession}</p>
        ) : session.discarded_at ? null : (
          // Interim placeholder only — Story 4.13.1 replaces this branch with
          // ImportReviewSheet (the real "review is done, now Save" surface).
          <p className="text-muted text-[0.9rem] m-0 py-[2rem] text-center">
            {t.individualReviewAllCaughtUp}
          </p>
        )}

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
