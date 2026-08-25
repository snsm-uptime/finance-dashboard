"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useDrag } from "@use-gesture/react";

import { SoftLedgerSelect } from "@/components/soft-ledger/Select";
import { IconButton } from "@/components/IconButton";
import { useChromeHeader } from "@/components/ChromeBack";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { fetchLists } from "@/app/lists/listsClient";
import { replaceMembershipLists, useMembershipLists } from "@/app/lists/membershipListsStore";
import { ArrowIcon, SaveIcon, TrashIcon } from "@/app/icons";
import { uploadCopy } from "@/lib/i18n/upload";
import type { Locale } from "@/lib/i18n/locale";
import { useCardIdentification } from "@/hooks/useCardIdentification";
import { CreditCardFace, CreditCardMark } from "../../CreditCardFace";
import { classifyActiveImportSession } from "../../classifyActiveImportSession";
import { DiscardConfirmDialog } from "../../DiscardConfirmDialog";
import { ImportCompletionSummary } from "./ImportCompletionSummary";
import { ImportReviewSheet } from "./ImportReviewSheet";
import {
  assignRow,
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
import {
  forgetOpenImportSession,
  rememberOpenImportSession,
} from "../../openImportSession";
import {
  clearLastCardStagedDiscard,
  restoreStagedDiscard,
  stageCardDiscard,
  useStagedImportDiscards,
} from "../../stagedImportDiscards";

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
// Left/right throw animation (default-list / chosen-list accept only — up
// (delete) and down (undo) stay button-primary and un-animated, per scope).
const THROW_DISTANCE = 480;
const THROW_ANIMATION_MS = 220;
// Mirrors api/domain/expenses.py:20 (normalize_row_description) — display-side
// guard only, the server is the actual enforcement point.
const DESCRIPTION_MAX_LENGTH = 500;
const TITLE_TEXT_CLASS =
  "m-0 w-full min-w-0 text-[1.05rem] leading-snug font-[550] text-foreground break-words";

/** Grow a title field in whole line-height steps, never below `minHeight`. */
export function titleTextareaHeightPx(
  scrollHeight: number,
  lineHeight: number,
  minHeight: number,
): number {
  const step = lineHeight > 0 ? lineHeight : 1;
  const raw = Math.max(scrollHeight, minHeight, step);
  return Math.max(1, Math.ceil(raw / step - 1e-9)) * step;
}

/**
 * Flattens statements → rows (statement order, then sequence order — the GET
 * contract already returns rows pending-only and sequence-ordered, so no
 * client-side filter/sort is needed) and returns the first pair. A `failed`
 * statement carries an empty `rows` array and so simply contributes nothing.
 */
export function nextReviewableRow(
  session: ImportSession | null,
  skippedIds: ReadonlySet<string> = EMPTY_SKIPPED,
): { row: CandidateRow; statement: StagedStatement } | null {
  if (!session || session.discarded_at) return null;
  for (const statement of session.statements) {
    for (const row of statement.rows) {
      if (!skippedIds.has(row.id)) return { row, statement };
    }
  }
  return null;
}

const EMPTY_SKIPPED: ReadonlySet<string> = new Set();

// Mirrors SessionReviewPanel.tsx's statementPeriodBounds — same StagedStatement
// shape, kept local per this codebase's co-located-pure-function convention.
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

// No utility formats a raw (amount, currency) pair for arbitrary currencies —
// display-only, mirrors the existing `formatCardBalance` use of `Number()` for
// rendering (never for computation, comparison, or the assign/PATCH payloads).
// Exported for ImportReviewSheet (Story 4.13.1), which renders the same
// CandidateRow shape.
export function formatRowAmount(amount: string, currency: string, locale: Locale): string {
  const parsed = Number(amount);
  const display = Number.isFinite(parsed)
    ? parsed.toLocaleString(locale === "es" ? "es-CR" : "en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : amount;
  return `${currency} ${display}`;
}

const DAY_NAMES: Record<Locale, readonly string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
};

const ROW_MONTH_ABBR: Record<Locale, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

// Sakamoto's algorithm — pure integer math, no JS `Date`, so no local-timezone
// shift risk on a date-only string (project-context's date-string rule).
function dayOfWeek(year: number, month: number, day: number): number {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  return (
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7
  );
}

// The year is already known from context, so it's dropped here — display-only,
// mirrors formatRowAmount's Number()-for-display carve-out. Exported for
// ImportReviewSheet (Story 4.13.1).
export function formatRowDate(iso: string, locale: Locale): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dayName = DAY_NAMES[locale][dayOfWeek(year, month, day)];
  const monthAbbr = ROW_MONTH_ABBR[locale][month - 1];
  return locale === "es" ? `${dayName}, ${day} ${monthAbbr}` : `${dayName}, ${monthAbbr} ${day}`;
}

function ArrowKeyKbd({ arrow }: { arrow: "←" | "→" }) {
  return (
    <kbd
      aria-hidden
      className="inline-flex box-border h-[1.25rem] min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface px-1 align-middle text-[0.75rem] leading-none font-[550] !text-accent"
    >
      {arrow}
    </kbd>
  );
}

function DirectionHint({ template }: { template: string }) {
  return (
    <p className="m-0 inline-flex w-full items-center justify-center gap-1 text-center text-muted text-[0.68rem]">
      {template.split(/(\{left\}|\{right\})/g).map((part, index) => {
        if (part === "{left}") return <ArrowKeyKbd key={index} arrow="←" />;
        if (part === "{right}") return <ArrowKeyKbd key={index} arrow="→" />;
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
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
  const { staged, discardedIds } = useStagedImportDiscards(sessionId);

  const [session, setSession] = useState<ImportSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const lists = useMembershipLists();
  const [listsError, setListsError] = useState<string | null>(null);
  const [defaultListId, setDefaultListId] = useState<string>("");
  const [pickedListId, setPickedListId] = useState<string>("");
  const [isCoarsePointer] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );
  const [cardLabelInput, setCardLabelInput] = useState<string>("");
  const [registering, setRegistering] = useState(false);
  // Left/right throw animation: live drag offset (1:1 finger-follow, no
  // transition) or the final thrown/snap-back offset (transition applies).
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const flingLockRef = useRef(false);

  const titleContainerRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const titleMinHeightRef = useRef(0);
  const titleSubmittingRef = useRef(false);
  const lastRowIdRef = useRef<string | undefined>(undefined);
  const lastTitleUndoRef = useRef<{ rowId: string; previousDescription: string } | null>(null);
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
      rememberOpenImportSession(sessionId);
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
      replaceMembershipLists(result.lists);
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

  const current = nextReviewableRow(session, discardedIds);
  const remainingCount = session
    ? session.statements.reduce(
        (sum, statement) =>
          sum + statement.rows.filter((row) => !discardedIds.has(row.id)).length,
        0,
      )
    : 0;
  const remainingLabel =
    session && current
      ? t.individualReviewProgress.replace("{count}", String(remainingCount))
      : "";
  const discardMessages: UploadMessages = useMemo(
    () => ({
      errorUnsupportedFileType: t.errorUnsupportedFileType,
      errorUnknownStatement: t.errorUnknownStatement,
      errorAmbiguousStatement: t.errorAmbiguousStatement,
      errorUnreadableStatement: t.errorUnreadableStatement,
      errorGeneric: t.errorGeneric,
      errorUnauthorized: t.errorUnauthorized,
    }),
    [
      t.errorUnsupportedFileType,
      t.errorUnknownStatement,
      t.errorAmbiguousStatement,
      t.errorUnreadableStatement,
      t.errorGeneric,
      t.errorUnauthorized,
    ],
  );
  const leavingRef = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // classifyActiveImportSession is contracted to only see genuinely active
  // sessions (Task 3.2: "discarded/finalized not used as active"). This
  // route can render a finalized session (the completion summary), so guard
  // here rather than passing it out-of-contract.
  const isFinalized = !!session?.finalized_at;
  const reviewKind = session && !isFinalized ? classifyActiveImportSession(session) : "untouched";
  const needsRetentionWarning =
    !isFinalized && (reviewKind === "partial" || reviewKind === "sheet-waiting");
  const onBack = useCallback(() => {
    if (leavingRef.current) return;
    if (needsRetentionWarning) {
      setConfirmDiscard(true);
      return;
    }
    leavingRef.current = true;
    if (isFinalized) {
      forgetOpenImportSession();
      router.push("/upload");
      return;
    }
    void discardSession(sessionId, discardMessages).finally(() => {
      forgetOpenImportSession();
      router.push("/upload");
    });
  }, [
    sessionId,
    router,
    needsRetentionWarning,
    isFinalized,
    discardMessages,
  ]);
  useChromeHeader({
    onBack,
    title: t.individualReviewTitle,
    details: remainingLabel || null,
  });
  const card = useCardIdentification(sessionId, current?.statement ?? null, cardMessages);

  const action = useFormSubmission(async (act: Action) => {
    if (!current) return { ok: false, error: t.errorGeneric };
    const { row } = current;

    if (act.kind === "delete") {
      stageCardDiscard(sessionId, row.id);
      return { ok: true };
    }
    if (act.kind === "undo") {
      if (staged.lastCardStagedId) {
        restoreStagedDiscard(sessionId, staged.lastCardStagedId);
        return { ok: true };
      }
      const result = await undoLastResolution(sessionId, messages);
      if (result.ok) setSession(result.session);
      return result;
    }

    const listId = act.kind === "acceptChosen" ? pickedListId : defaultListId;
    if (!listId) return { ok: false, error: t.errorGeneric };
    const result = await assignRow(sessionId, row.id, listId, messages);
    if (result.ok) {
      clearLastCardStagedDiscard(sessionId);
      setSession(result.session);
    }
    return result;
  });

  const listOptions = useMemo(
    () =>
      (lists ?? [])
        .filter((l) => l.id !== defaultListId)
        .map((l) => ({ value: l.id, label: l.name })),
    [lists, defaultListId],
  );
  const defaultListName = (lists ?? []).find((l) => l.id === defaultListId)?.name ?? "";
  const chosenListName = (lists ?? []).find((l) => l.id === pickedListId)?.name ?? "";

  // Story 4.8.1 (preserved): block accept until the row's parent statement's
  // card is identified/registered when that statement carries an IBAN.
  const cardReadyOrNoIban = !current?.statement.iban || card.cardMatched;
  const canAcceptChosen = !!current && !!pickedListId && cardReadyOrNoIban && !card.loading;
  // `lists !== null` guards a loading race: /api/auth/me can resolve
  // defaultListId before /api/lists resolves lists, which would otherwise
  // render this button enabled with a blank defaultListName.
  const canAcceptDefault =
    !!current && !!defaultListId && lists !== null && cardReadyOrNoIban && !card.loading;
  // Delete has no card-identification gate — a pending row is always
  // deletable, since delete never touches a list (Task 3.4).
  const canDelete = !!current;
  const canUndo = !!session?.undo || !!staged.lastCardStagedId;
  const throwing = dragOffset !== null;

  // Left/right only (up/delete and down/undo stay button-primary, unanimated,
  // per AD-9 and this round's scoped ask). The card visually flies off before
  // the actual submit fires, so the outgoing card is always seen in motion
  // regardless of how fast the request resolves.
  //
  // flingLockRef is a synchronous guard: `throwing` (derived from state) only
  // reflects reality after React commits a render, so two triggers dispatched
  // in the same tick (e.g. a click immediately followed by a keydown) could
  // both read stale throwing=false and both schedule a submit. The ref closes
  // that gap immediately, independent of render timing.
  function flingAndSubmit(offset: { x: number; y: number }, act: Action) {
    if (flingLockRef.current) return;
    flingLockRef.current = true;
    setIsDragging(false);
    setDragOffset(offset);
    window.setTimeout(() => {
      void action.submit(act).finally(() => {
        setDragOffset(null);
        flingLockRef.current = false;
      });
    }, THROW_ANIMATION_MS);
  }

  useDrag(
    ({ first, active, last, movement: [mx, my], velocity: [vx, vy], direction: [dx, dy] }) => {
      // titleState !== "idle": the title container sits inside cardRef, so
      // without this guard a touch drag to place a cursor or select text in
      // the primed/mounted title would be captured as a card swipe instead.
      if (!isCoarsePointer || action.pending || titleState !== "idle") return;
      // Block a brand-new gesture from starting while a previous fling/undo
      // snap-back is still resolving — but once a gesture is under way, its
      // own live dragOffset updates must not block its own continuation.
      if (first && throwing) return;

      if (active && !last) {
        // Live 1:1 follow, horizontal only — the vertical (up/delete) axis
        // keeps its existing invisible-until-release behavior, unchanged.
        setIsDragging(true);
        setDragOffset({ x: mx, y: 0 });
        return;
      }
      if (!last) return;
      setIsDragging(false);

      const absX = Math.abs(mx);
      const absY = Math.abs(my);
      if (absX < SWIPE_DISTANCE_THRESHOLD && absY < SWIPE_DISTANCE_THRESHOLD) {
        setDragOffset(null); // below threshold — snap back
        return;
      }

      // AD-9 amended 2026-08-20: vertical swipe axis is up → delete; down is
      // never a gesture (undo is button-only on every platform), so there is
      // no branch mapping a downward drag to anything.
      if (absY > absX && dy < 0 && vy > 0) {
        setDragOffset(null);
        if (canDelete) action.submit({ kind: "delete" });
        return;
      }
      if (dx > 0 && vx > 0 && canAcceptChosen) {
        flingAndSubmit({ x: THROW_DISTANCE, y: 0 }, { kind: "acceptChosen" });
        return;
      }
      if (dx < 0 && vx > 0 && canAcceptDefault) {
        flingAndSubmit({ x: -THROW_DISTANCE, y: 0 }, { kind: "acceptDefault" });
        return;
      }
      setDragOffset(null);
    },
    // touch-none + passive: false: the card must recognize its own vertical
    // (up → delete) and horizontal (left/right → accept) gestures, so native
    // browser touch-action handling is fully disabled here rather than left
    // to compete with useDrag on any axis (Story 4.8 review finding).
    { target: cardRef, eventOptions: { passive: false } },
  );

  // Desktop: ← → keys mirror the left/right buttons (default/chosen accept
  // only — delete/undo stay button-only). Ignored while a text input/select
  // or the SoftLedgerSelect combobox (a custom listbox, not a native
  // <select>) has focus, so it doesn't fight the title-edit field or the
  // list picker's own arrow-key navigation.
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement ||
        (target instanceof Element &&
          target.closest('[role="listbox"], [aria-haspopup="listbox"]'))
      ) {
        return;
      }
      // Arrow keys otherwise scroll the page. Always consume them on this
      // screen — including while a throw is in flight, when a flung card can
      // briefly widen the layout and make ArrowLeft pan horizontally.
      event.preventDefault();
      if (!current || throwing || action.pending) return;
      if (event.key === "ArrowLeft" && canAcceptDefault) {
        flingAndSubmit({ x: -THROW_DISTANCE, y: 0 }, { kind: "acceptDefault" });
      } else if (event.key === "ArrowRight" && canAcceptChosen) {
        flingAndSubmit({ x: THROW_DISTANCE, y: 0 }, { kind: "acceptChosen" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    current?.row.id,
    canAcceptDefault,
    canAcceptChosen,
    throwing,
    action.pending,
    pickedListId,
    defaultListId,
  ]);

  // Title edit state resets whenever the reviewed row changes — by any of
  // assign/delete/undo resolving, or a session refresh (AC #8). Adjusted
  // during render (not in an effect) per React's "reset state when a prop
  // changes" pattern — avoids an extra commit-then-reset render pass. Only
  // `lastRowIdRef` (this pattern's own "previous value" ref) is written here;
  // any other ref write must happen in an effect (react-hooks/refs).
  if (lastRowIdRef.current !== current?.row.id) {
    lastRowIdRef.current = current?.row.id;
    setTitleState("idle");
    setTitleDraft("");
    setTitleError(null);
  }

  useEffect(() => {
    lastTitleUndoRef.current = null;
  }, [current?.row.id]);

  function resizeTitleTextarea() {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 21;
    el.style.height = `${titleTextareaHeightPx(el.scrollHeight, lineHeight, titleMinHeightRef.current)}px`;
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
    const previousDescription = current.row.description;
    const rowId = current.row.id;
    setTitleError(null);
    titleSubmittingRef.current = true;
    setTitleSubmitting(true);
    try {
      const result = await editRowDescription(sessionId, rowId, trimmed, messages);
      if (!result.ok) {
        if (result.error === messages.errorRowNotAvailable) {
          // Concurrent resolution between prime and commit (AC #9) — refresh
          // from the next GET rather than showing a stale edit.
          const refreshed = await fetchImportSession(sessionId, messages);
          if (refreshed.ok) {
            setSession(refreshed.session);
          } else {
            setSessionError(refreshed.error);
            setTitleState("idle");
            setTitleDraft("");
            setTitleError(null);
          }
          return;
        }
        setTitleError(result.error);
        return;
      }
      lastTitleUndoRef.current = { rowId, previousDescription };
      setSession(result.session);
      setTitleState("idle");
      setTitleDraft("");
      setTitleError(null);
    } finally {
      titleSubmittingRef.current = false;
      setTitleSubmitting(false);
    }
  }

  const commitTitleEditRef = useRef(commitTitleEdit);
  useEffect(() => {
    commitTitleEditRef.current = commitTitleEdit;
  });

  useLayoutEffect(() => {
    if (titleState !== "editing") return;
    resizeTitleTextarea();
  }, [titleState, titleDraft]);

  useEffect(() => {
    if (titleState !== "editing") return;
    titleInputRef.current?.focus();
  }, [titleState]);

  useEffect(() => {
    if (titleState === "idle") return;
    function onPointerDown(event: PointerEvent) {
      const container = titleContainerRef.current;
      if (container && event.target instanceof Node && container.contains(event.target)) {
        return;
      }
      if (titleSubmittingRef.current) return;
      if (titleState === "primed") {
        setTitleState("idle");
        setTitleDraft("");
        setTitleError(null);
        return;
      }
      void commitTitleEditRef.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [titleState]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "z" && event.key !== "Z") return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.shiftKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      const pending = lastTitleUndoRef.current;
      if (!pending || pending.rowId !== current?.row.id || titleSubmittingRef.current) return;
      event.preventDefault();
      titleSubmittingRef.current = true;
      setTitleSubmitting(true);
      void editRowDescription(sessionId, pending.rowId, pending.previousDescription, messages)
        .then((result) => {
          if (result.ok) {
            lastTitleUndoRef.current = null;
            setSession(result.session);
            setTitleState("idle");
            setTitleDraft("");
            setTitleError(null);
            return;
          }
          setTitleError(result.error);
        })
        .finally(() => {
          titleSubmittingRef.current = false;
          setTitleSubmitting(false);
        });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, current?.row.id]);

  function handleTitleClick() {
    if (!current) return;
    if (titleState === "idle") {
      setTitleDraft(current.row.description);
      setTitleError(null);
      setTitleState("primed");
      return;
    }
    if (titleState === "primed") {
      const heading = titleContainerRef.current?.querySelector("h2");
      titleMinHeightRef.current =
        heading instanceof HTMLElement ? heading.offsetHeight : 0;
      setTitleState("editing");
    }
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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

  // Mirrors SessionReviewPanel.tsx's StatementCard `needsRegistration` — same
  // statement shape, same OR'd fallback for a matched-but-not-yet-flagged card.
  const needsCardRegistration =
    card.needsRegistration ||
    (!card.cardMatched && Boolean(current?.statement.iban) && !current?.statement.card_id);
  const savedCardName = card.cardLabel || t.newCardTitle;
  const period = current ? statementPeriodBounds(current.statement) : { start: null, end: null };

  async function handleRegisterCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cardLabelInput.trim()) return;
    setRegistering(true);
    const result = await card.registerCard(cardLabelInput.trim());
    setRegistering(false);
    if (result.ok) setCardLabelInput("");
  }

  return (
    <main
      className="min-h-full flex flex-col gap-4 overflow-x-hidden pb-[2.5rem] pt-3"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      {sessionError || listsError ? (
        <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-4 px-[1.5rem]">
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
        </div>
      ) : null}

      {current ? (
        <>
          <div className="w-full px-2">
            <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-4">
              <DirectionHint
                template={
                  isCoarsePointer
                    ? t.individualReviewDirectionHintTouch
                    : t.individualReviewDirectionHintKeyboard
                }
              />

              {listOptions.length > 0 ? (
                <SoftLedgerSelect
                  id={selectId}
                  value={pickedListId}
                  options={[{ value: "", label: t.individualReviewChooseList }, ...listOptions]}
                  onChange={setPickedListId}
                />
              ) : null}
            </div>
          </div>

          <div className="grid w-full overflow-x-hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_minmax(0,1fr)] grid-rows-[auto_auto] items-center gap-3 px-2 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)_minmax(0,1fr)]">
            <IconButton
              className="col-start-1 row-start-1 w-full min-w-0 justify-center self-center"
              variant="ghost"
              disabled={!canAcceptDefault || action.pending || throwing}
              onClick={() =>
                flingAndSubmit({ x: -THROW_DISTANCE, y: 0 }, { kind: "acceptDefault" })
              }
              label={
                defaultListId
                  ? t.individualReviewAcceptDefault.replace("{list}", defaultListName)
                  : t.individualReviewNoDefaultListShort
              }
              caption={
                action.pending && !throwing
                  ? t.individualReviewCommitting
                  : defaultListId
                    ? defaultListName
                    : t.individualReviewNoDefaultListShort
              }
              icon={<ArrowIcon className="w-4 h-4" />}
            />

            <div
              ref={cardRef}
              className="relative col-start-2 row-start-1 flex min-h-[11rem] min-w-0 w-full flex-col justify-between rounded-[12px] border border-border bg-surface p-[1.25rem] shadow-lg touch-none"
              style={{
                transform: dragOffset
                  ? `translateX(${dragOffset.x}px) rotate(${dragOffset.x / 20}deg)`
                  : undefined,
                // Only fade out once committed to a fling (post-release,
                // isDragging false) — never during a live, uncommitted drag,
                // or dragging far past the threshold and back below it
                // makes the card vanish/reappear mid-gesture.
                opacity:
                  !isDragging && dragOffset && Math.abs(dragOffset.x) >= THROW_DISTANCE * 0.9
                    ? 0
                    : 1,
                transition: isDragging ? "none" : "transform 220ms ease, opacity 220ms ease",
              }}
            >
              <IconButton
                className="absolute top-2 right-2"
                variant="ghost"
                disabled={!canDelete || action.pending || throwing}
                onClick={() => action.submit({ kind: "delete" })}
                label={
                  action.pending ? t.individualReviewDeleting : t.individualReviewDelete
                }
                icon={<TrashIcon className="w-4 h-4" />}
              />
              <div
                ref={titleContainerRef}
                onClick={handleTitleClick}
                role={titleState !== "editing" ? "button" : undefined}
                tabIndex={titleState !== "editing" ? 0 : undefined}
                onKeyDown={
                  titleState !== "editing"
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleTitleClick();
                        }
                      }
                    : undefined
                }
                className={`cursor-text rounded-sm -mx-1 -my-1 min-w-0 py-1 pl-1 pr-8 ${titleState !== "idle" ? "border border-accent" : ""
                  }`}
              >
                {titleState === "editing" ? (
                  <textarea
                    ref={titleInputRef}
                    value={titleDraft}
                    rows={1}
                    onChange={(e) => setTitleDraft(e.currentTarget.value)}
                    onKeyDown={onTitleKeyDown}
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    disabled={titleSubmitting}
                    autoComplete="off"
                    aria-label={t.individualReviewTitleFieldLabel}
                    className={`${TITLE_TEXT_CLASS} block resize-none overflow-hidden border-0 bg-transparent p-0 outline-none disabled:opacity-55`}
                  />
                ) : (
                  <h2 className={`${TITLE_TEXT_CLASS} whitespace-normal overflow-visible`}>
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
                  {formatRowAmount(current.row.amount, current.row.currency, locale)}
                </p>
                <p className="m-0 mt-[0.5rem] text-[0.8rem] text-muted">
                  {formatRowDate(current.row.posted_date, locale)}
                </p>
              </div>
            </div>

            <IconButton
              className="col-start-3 row-start-1 w-full min-w-0 justify-center self-center"
              variant="ghost"
              disabled={!canAcceptChosen || action.pending || throwing}
              onClick={() =>
                flingAndSubmit({ x: THROW_DISTANCE, y: 0 }, { kind: "acceptChosen" })
              }
              label={t.individualReviewAcceptChosen.replace(
                "{list}",
                chosenListName || t.individualReviewChooseList,
              )}
              caption={
                action.pending && !throwing
                  ? t.individualReviewCommitting
                  : chosenListName || t.individualReviewChooseList
              }
              icon={<ArrowIcon className="w-4 h-4 rotate-180" />}
            />

            <div />
            <button
              type="button"
              disabled={!canUndo || action.pending || throwing}
              onClick={() => action.submit({ kind: "undo" })}
              className="col-start-2 row-start-2 justify-self-center m-0 px-3 py-[6px] rounded-sm border border-border bg-transparent text-foreground cursor-pointer font-[550] text-[0.8rem] disabled:opacity-55 disabled:cursor-not-allowed"
            >
              {action.pending ? t.individualReviewUndoing : t.individualReviewUndo}
            </button>
            <div />
          </div>

          <div className="w-full px-2">
            <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-4">
              {/* Card identification / registration (Story 4.8.1) — subordinate
                  to the four-direction card, only relevant when the row's
                  parent statement carries an IBAN. Reuses CreditCardFace, same
                  as SessionReviewPanel's StatementCard renders it. */}
              {current.statement.iban ? (
              <div className="w-full">
                {card.loading ? (
                  <p className="m-0 text-[0.85rem] text-muted">{t.cardIdentificationTitle}…</p>
                ) : needsCardRegistration ? (
                  <form className="m-0 w-full" onSubmit={handleRegisterCard}>
                    <CreditCardFace
                      cardName={
                        <>
                          <CreditCardMark />
                          <label className="flex items-center gap-1.5 min-w-0 flex-1 rounded-[6px] border border-white/70 bg-white/8 py-1 px-2">
                            <span className="sr-only">{t.cardIdentificationLabel}</span>
                            <input
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
                              className="w-7 h-7 min-w-7 p-0! text-white hover:text-white"
                              type="submit"
                              disabled={!cardLabelInput.trim() || registering || card.loading}
                              label={
                                registering || card.loading
                                  ? t.cardIdentificationRegistering
                                  : t.cardIdentificationRegister
                              }
                              icon={<SaveIcon className="block w-4 h-4" />}
                            />
                          </label>
                        </>
                      }
                      iban={current.statement.iban}
                      filename={current.statement.filename}
                      periodStart={period.start}
                      periodEnd={period.end}
                      periodLabel={t.cardPeriodLabel}
                    />
                  </form>
                ) : (
                  <CreditCardFace
                    cardName={
                      <>
                        <CreditCardMark />
                        <p className="m-0 min-w-0 truncate text-[0.78rem] font-semibold uppercase tracking-[0.06em]">
                          {savedCardName}
                        </p>
                      </>
                    }
                    iban={current.statement.iban}
                    filename={current.statement.filename}
                    periodStart={period.start}
                    periodEnd={period.end}
                    periodLabel={t.cardPeriodLabel}
                  />
                )}
              </div>
            ) : null}
            {card.error ? <p className="m-0 text-owe text-[0.85rem]">{card.error}</p> : null}

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
            </div>
          </div>
        </>
      ) : !session ? (
        <p className="mx-auto w-full max-w-[26rem] px-[1.5rem] text-muted text-[0.85rem] m-0">
          {t.individualReviewLoadingSession}
        </p>
      ) : session.discarded_at ? null : !session.finalized_at ? (
        <ImportReviewSheet
          sessionId={sessionId}
          session={session}
          lists={lists}
          onSessionUpdate={setSession}
          onClose={() => router.push("/upload")}
        />
      ) : (
        <ImportCompletionSummary session={session} />
      )}
      <DiscardConfirmDialog
        open={confirmDiscard}
        title={t.discardConfirmTitle}
        body={t.discardConfirmBody}
        confirmLabel={t.discardConfirmAction}
        cancelLabel={t.discardCancel}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          if (leavingRef.current) return;
          leavingRef.current = true;
          void discardSession(sessionId, discardMessages).finally(() => {
            forgetOpenImportSession();
            router.push("/upload");
          });
        }}
      />
    </main>
  );
}
