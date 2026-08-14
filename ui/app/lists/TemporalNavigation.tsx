"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

import { ShareIcon, PieChartIcon, CloseIcon } from "@/app/icons";
import { FormIconSubmit } from "@/components/FormIconSubmit";
import type { DefaultSplitPayload, ListMember } from "./listsClient";
import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import type { DefaultSplitMessages } from "./DefaultSplitPanel";
import { DefaultSplitPanel } from "./DefaultSplitPanel";
import styles from "./TemporalNavigation.module.scss";

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
  title: string;
  onClose: () => void;
  /** Content for the top-left of the form header (e.g. save icon), matching Sheet.cornerAction */
  cornerAction?: ReactNode;
  children: ReactNode;
};

function FormWrapper({ title, onClose, cornerAction, children }: FormWrapperProps) {
  return (
    <div className={styles.formContainer}>
      <div className={styles.formHeader}>
        {cornerAction ? <div className={styles.formLeading}>{cornerAction}</div> : null}
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
      <div className={styles.formBody}>{children}</div>
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
  const [splitCanSave, setSplitCanSave] = useState(false);
  const splitSaveRequestRef = useRef<(() => void) | null>(null);

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
        <FormWrapper title={inviteMessages.inviteTitle} onClose={handleClose}>
          <InviteForm listId={listId} messages={inviteMessages} reserveErrorHeight />
        </FormWrapper>
      ) : null}

      {openForm === "split" && isOwner && defaultSplit && members.length > 1 ? (
        <FormWrapper
          title={splitMessages.defaultSplitTitle}
          onClose={handleClose}
          cornerAction={
            <FormIconSubmit
              type="button"
              variant="save"
              label={splitMessages.defaultSplitSave}
              disabled={!splitCanSave}
              onClick={() => splitSaveRequestRef.current?.()}
            />
          }
        >
          <DefaultSplitPanel
            listId={listId}
            isOwner={isOwner}
            initial={defaultSplit}
            members={members}
            messages={splitMessages}
            onSuccess={handleClose}
            onSaveRequest={(fn) => {
              splitSaveRequestRef.current = fn;
            }}
            onCanSaveChange={setSplitCanSave}
          />
        </FormWrapper>
      ) : null}
    </div>
  );
}
