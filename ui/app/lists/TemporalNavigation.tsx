"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { DefaultSplitPayload, ListMember } from "./listsClient";
import type { ManualExpenseMessages } from "./ManualExpenseForm";
import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import type { DefaultSplitMessages } from "./DefaultSplitPanel";
import { DefaultSplitPanel } from "./DefaultSplitPanel";
import { FormHeaderActionHostProvider } from "./FormChrome";
import styles from "./TemporalNavigation.module.css";

type FormKind = "expense" | "invite" | "split" | null;

type Props = {
  listId: string;
  currentUserId: string;
  members: ListMember[];
  isOwner: boolean;
  defaultSplit: DefaultSplitPayload | null;
  expenseMessages: ManualExpenseMessages;
  inviteMessages: InviteFormMessages;
  splitMessages: DefaultSplitMessages;
};

function ShareIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
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

function PieChartIcon() {
  return (
    <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">
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

type FormWrapperProps = {
  kind: FormKind;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

function FormWrapper({ kind, title, onClose, children }: FormWrapperProps) {
  const [actionHost, setActionHost] = useState<HTMLDivElement | null>(null);

  if (kind === null) return null;

  return (
    <div className={styles.formContainer}>
      <div className={styles.formHeader}>
        <div ref={setActionHost} className={styles.formLeading} />
        <h3 className={styles.formTitle}>{title}</h3>
        <button
          type="button"
          className={styles.formClose}
          aria-label={`Close ${title}`}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      <FormHeaderActionHostProvider host={actionHost}>
        <div className={styles.formBody}>{children}</div>
      </FormHeaderActionHostProvider>
    </div>
  );
}

export function TemporalNavigation({
  listId,
  currentUserId,
  members,
  isOwner,
  defaultSplit,
  expenseMessages,
  inviteMessages,
  splitMessages,
}: Props) {
  const [openForm, setOpenForm] = useState<FormKind>(null);

  const handleClose = useCallback(() => {
    setOpenForm(null);
  }, []);

  const showNav = openForm === null;
  const showInvite = isOwner;

  return (
    <div className={styles.chrome}>
      {showNav ? (
        <div className={styles.navGroup} role="group">
          <button
            type="button"
            className={styles.navButton}
            title="Share / Invite"
            onClick={() => setOpenForm("invite")}
            aria-label="Share / Invite"
          >
            <ShareIcon />
          </button>
          {isOwner && defaultSplit && members.length > 1 ? (
            <button
              type="button"
              className={styles.navButton}
              title="Split Settings"
              onClick={() => setOpenForm("split")}
              aria-label="Split Settings"
            >
              <PieChartIcon />
            </button>
          ) : null}
        </div>
      ) : null}

      {openForm === "invite" && showInvite ? (
        <FormWrapper kind={openForm} title={inviteMessages.inviteTitle} onClose={handleClose}>
          <InviteForm listId={listId} messages={inviteMessages} reserveErrorHeight />
        </FormWrapper>
      ) : null}

      {openForm === "split" && isOwner && defaultSplit && members.length > 1 ? (
        <FormWrapper
          kind={openForm}
          title={splitMessages.defaultSplitTitle}
          onClose={handleClose}
        >
          <DefaultSplitPanel
            listId={listId}
            isOwner={isOwner}
            initial={defaultSplit}
            members={members}
            messages={splitMessages}
          />
        </FormWrapper>
      ) : null}
    </div>
  );
}
