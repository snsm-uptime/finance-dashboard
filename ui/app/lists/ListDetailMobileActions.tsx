"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import type { ManualExpenseMessages } from "./ManualExpenseForm";
import { ManualExpenseForm } from "./ManualExpenseForm";
import type { DefaultSplitMessages } from "./DefaultSplitPanel";
import { DefaultSplitPanel } from "./DefaultSplitPanel";
import { FormHeaderActionHostProvider } from "./FormChrome";
import type { DefaultSplitPayload, ListMember } from "./listsClient";
import styles from "./ListDetailMobileActions.module.css";

type SheetKind = "expense" | "invite" | "split" | null;

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  isOwner: boolean;
  canInvite: boolean;
  canAddExpense: boolean;
  defaultSplit: DefaultSplitPayload | null;
  expenseMessages: ManualExpenseMessages;
  inviteMessages: InviteFormMessages;
  splitMessages: DefaultSplitMessages;
  addExpenseAria: string;
  inviteAria: string;
  closeLabel: string;
};

function PlusIcon() {
  return (
    <svg className={styles.fabIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg className={styles.fabIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r="3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5.5 19.25c1.4-3.1 3.7-4.65 6.5-4.65s5.1 1.55 6.5 4.65"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PieChartIcon() {
  return (
    <svg className={styles.fabIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M 12 2 A 10 10 0 0 1 20.66 6.34 L 12 12 Z" fill="currentColor" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg className={styles.fabIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M8.59 13.51L15.41 17.49"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.41 6.51L8.59 10.49"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className={styles.closeIcon} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6.5 6.5l11 11M17.5 6.5l-11 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Sheet({
  open,
  label,
  onClose,
  closeLabel,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [actionHost, setActionHost] = useState<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<"unmounted" | "mounting" | "open" | "closing">(
    "unmounted"
  );

  // Respond to open prop changes: transition to mounting or closing
  useEffect(() => {
    if (open && phase === "unmounted") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("mounting");
    } else if (!open && phase !== "unmounted" && phase !== "closing") {
      setPhase("closing");
    }
  }, [open, phase]);

  // Handle mounting phase: trigger visibility animation
  useEffect(() => {
    if (phase === "mounting") {
      const show = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setPhase("open");
        });
      });
      return () => window.cancelAnimationFrame(show);
    }
  }, [phase]);

  // Handle closing phase: delay unmounting for animation
  useEffect(() => {
    if (phase === "closing") {
      const hide = window.setTimeout(() => {
        setPhase("unmounted");
      }, 280);
      return () => window.clearTimeout(hide);
    }
  }, [phase]);

  // Focus management and keyboard traps when sheet is visible
  useEffect(() => {
    if (phase !== "open") return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [phase, onClose]);

  if (phase === "unmounted" || typeof document === "undefined") return null;

  const isVisible = phase === "open" || phase === "closing";

  return createPortal(
    <>
      <button
        type="button"
        className={`${styles.backdrop} ${isVisible ? styles.backdropOpen : ""}`}
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`${styles.sheet} ${isVisible ? styles.sheetOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.sheetHeader}>
          <div ref={setActionHost} className={styles.sheetLeading} />
          <h2 id={titleId} className={styles.sheetTitle}>
            {label}
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.sheetClose}
            aria-label={closeLabel}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <FormHeaderActionHostProvider host={actionHost}>
          <div className={styles.sheetBody}>{children}</div>
        </FormHeaderActionHostProvider>
      </div>
    </>,
    document.body,
  );
}

/**
 * Mobile-only actions for list detail: vertical FAB + bottom sheets.
 * Hidden from md breakpoint up (sidebar owns the same forms there).
 */
export function ListDetailMobileActions({
  listId,
  currentUserId,
  members,
  isOwner,
  canInvite,
  canAddExpense,
  defaultSplit,
  expenseMessages,
  inviteMessages,
  splitMessages,
  addExpenseAria,
  inviteAria,
  closeLabel,
}: Props) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const close = useCallback(() => setSheet(null), []);

  if (!canAddExpense && !canInvite) return null;

  const canShowSplit = isOwner && defaultSplit && members.length > 1;
  const groupLabel =
    canAddExpense && canInvite && canShowSplit
      ? `${addExpenseAria}, ${splitMessages.defaultSplitTitle}, ${inviteAria}`
      : canAddExpense && canInvite
        ? `${addExpenseAria}, ${inviteAria}`
        : canAddExpense
          ? addExpenseAria
          : inviteAria;

  return (
    <div className={styles.chrome}>
      <div className={styles.fab} role="group" aria-label={groupLabel}>
        {canAddExpense ? (
          <button
            type="button"
            className={styles.fabHalf}
            aria-label={addExpenseAria}
            aria-expanded={sheet === "expense"}
            onClick={() => setSheet("expense")}
            title={addExpenseAria}
          >
            <PlusIcon />
          </button>
        ) : null}
        {canShowSplit ? (
          <button
            type="button"
            className={styles.fabHalf}
            aria-label={splitMessages.defaultSplitTitle}
            aria-expanded={sheet === "split"}
            onClick={() => setSheet("split")}
            title={splitMessages.defaultSplitTitle}
          >
            <PieChartIcon />
          </button>
        ) : null}
        {canInvite ? (
          <button
            type="button"
            className={styles.fabHalf}
            aria-label={inviteAria}
            aria-expanded={sheet === "invite"}
            onClick={() => setSheet("invite")}
            title={inviteAria}
          >
            <ShareIcon />
          </button>
        ) : null}
      </div>

      {canAddExpense ? (
        <Sheet
          open={sheet === "expense"}
          label={expenseMessages.expenseTitle}
          onClose={close}
          closeLabel={closeLabel}
        >
          <ManualExpenseForm
            listId={listId}
            currentUserId={currentUserId}
            members={members}
            messages={expenseMessages}
          />
        </Sheet>
      ) : null}

      {canShowSplit ? (
        <Sheet
          open={sheet === "split"}
          label={splitMessages.defaultSplitTitle}
          onClose={close}
          closeLabel={closeLabel}
        >
          <DefaultSplitPanel
            listId={listId}
            isOwner={isOwner}
            initial={defaultSplit}
            members={members}
            messages={splitMessages}
          />
        </Sheet>
      ) : null}

      {canInvite ? (
        <Sheet
          open={sheet === "invite"}
          label=""
          onClose={close}
          closeLabel={closeLabel}
        >
          <InviteForm
            listId={listId}
            messages={inviteMessages}
            reserveErrorHeight
          />
        </Sheet>
      ) : null}
    </div>
  );
}
