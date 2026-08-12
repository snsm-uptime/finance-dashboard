"use client";

import {
  useCallback,
  useState,
  type ReactNode,
} from "react";

import { PlusIcon, PieChartIcon, ShareIcon } from "@/app/icons";
import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import type { ManualExpenseMessages } from "./ManualExpenseForm";
import { ManualExpenseForm } from "./ManualExpenseForm";
import type { DefaultSplitMessages } from "./DefaultSplitPanel";
import { DefaultSplitPanel } from "./DefaultSplitPanel";
import type { DefaultSplitPayload, ListMember } from "./listsClient";
import { Sheet } from "./Sheet";
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
            <PlusIcon className={styles.fabIcon} />
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
            <PieChartIcon className={styles.fabIcon} />
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
            <ShareIcon className={styles.fabIcon} />
          </button>
        ) : null}
      </div>

      {canAddExpense ? (
        <Sheet
          open={sheet === "expense"}
          title={expenseMessages.expenseTitle}
          onClose={close}
          closeLabel={closeLabel}
          body={
            <ManualExpenseForm
              listId={listId}
              currentUserId={currentUserId}
              members={members}
              messages={expenseMessages}
            />
          }
        />
      ) : null}

      {canShowSplit ? (
        <Sheet
          open={sheet === "split"}
          title={splitMessages.defaultSplitTitle}
          onClose={close}
          closeLabel={closeLabel}
          body={
            <DefaultSplitPanel
              listId={listId}
              isOwner={isOwner}
              initial={defaultSplit}
              members={members}
              messages={splitMessages}
            />
          }
        />
      ) : null}

      {canInvite ? (
        <Sheet
          open={sheet === "invite"}
          title={inviteMessages.inviteTitle}
          onClose={close}
          closeLabel={closeLabel}
          body={
            <InviteForm
              listId={listId}
              messages={inviteMessages}
              reserveErrorHeight
              hideBorder
            />
          }
        />
      ) : null}
    </div>
  );
}
