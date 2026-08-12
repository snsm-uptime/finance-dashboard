"use client";

import { useCallback, useState, type ReactNode } from "react";

import { ShareIcon, PieChartIcon, CloseIcon } from "@/app/icons";
import type { DefaultSplitPayload, ListMember } from "./listsClient";
import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import type { DefaultSplitMessages } from "./DefaultSplitPanel";
import { DefaultSplitPanel } from "./DefaultSplitPanel";
import { FormHeaderActionHostProvider } from "./FormChrome";
import styles from "./TemporalNavigation.module.css";

type FormKind = "expense" | "invite" | "split" | null;

type Props = {
  listId: string;
  members: ListMember[];
  isOwner: boolean;
  defaultSplit: DefaultSplitPayload | null;
  inviteMessages: InviteFormMessages;
  splitMessages: DefaultSplitMessages;
};

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
          <CloseIcon className={styles.closeIcon} />
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
  members,
  isOwner,
  defaultSplit,
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
            <ShareIcon className={styles.navIcon} />
          </button>
          {isOwner && defaultSplit && members.length > 1 ? (
            <button
              type="button"
              className={styles.navButton}
              title="Split Settings"
              onClick={() => setOpenForm("split")}
              aria-label="Split Settings"
            >
              <PieChartIcon className={styles.navIcon} />
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
