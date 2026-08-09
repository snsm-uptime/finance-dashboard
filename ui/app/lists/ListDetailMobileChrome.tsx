"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import type { ManualExpenseMessages } from "./ManualExpenseForm";
import { ManualExpenseForm } from "./ManualExpenseForm";
import type { ListMember } from "./listsClient";
import styles from "./ListDetailMobileChrome.module.css";

type SheetKind = "expense" | "invite" | null;

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  canInvite: boolean;
  canAddExpense: boolean;
  expenseMessages: ManualExpenseMessages;
  inviteMessages: InviteFormMessages;
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
  const [phase, setPhase] = useState<"unmounted" | "mounting" | "open" | "closing">(
    "unmounted"
  );

  // Respond to open prop changes: transition to mounting or closing
  useEffect(() => {
    if (open && phase === "unmounted") {
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
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Mobile-only actions for list detail: split pill FAB + mid-screen sheets.
 * Hidden from md breakpoint up (sidebar owns the same forms there).
 */
export function ListDetailMobileChrome({
  listId,
  currentUserId,
  members,
  canInvite,
  canAddExpense,
  expenseMessages,
  inviteMessages,
  addExpenseAria,
  inviteAria,
  closeLabel,
}: Props) {
  const [sheet, setSheet] = useState<SheetKind>(null);
  const close = useCallback(() => setSheet(null), []);

  if (!canAddExpense && !canInvite) return null;

  const groupLabel =
    canAddExpense && canInvite
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
          >
            <PlusIcon />
          </button>
        ) : null}
        {canInvite ? (
          <button
            type="button"
            className={styles.fabHalf}
            aria-label={inviteAria}
            aria-expanded={sheet === "invite"}
            onClick={() => setSheet("invite")}
          >
            <UserIcon />
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

      {canInvite ? (
        <Sheet
          open={sheet === "invite"}
          label={inviteMessages.inviteTitle}
          onClose={close}
          closeLabel={closeLabel}
        >
          <InviteForm listId={listId} messages={inviteMessages} />
        </Sheet>
      ) : null}
    </div>
  );
}
