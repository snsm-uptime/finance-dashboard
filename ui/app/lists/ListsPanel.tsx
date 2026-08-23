"use client";

import {
  FormEvent,
  KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { Chip } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import {
  IconButtonPopup,
  IconButtonPopupItem,
} from "@/components/IconButtonPopup";
import { usePreferences } from "@/components/PreferencesProvider";
import { listsMessages } from "@/lib/i18n/lists";
import { DotsIcon, PlusIcon } from "@/app/icons";
import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import { Sheet } from "./Sheet";
import {
  balanceTone,
  createList,
  formatCardBalance,
  deleteList,
  memberLabel,
  renameList,
  setLastOpenedList,
  type ListItem,
} from "./listsClient";
import styles from "./lists.module.scss";

function rosterForCard(list: ListItem, currentUserId: string) {
  return [...(list.members ?? [])]
    .filter((member) => member.user_id !== currentUserId)
    .sort((a, b) =>
      memberLabel(a).localeCompare(memberLabel(b), undefined, {
        sensitivity: "base",
      }),
    );
}

function ListRoleBookmark({ mark, label }: { mark: string; label: string }) {
  return (
    <span className={styles.roleBookmark} aria-label={label}>
      {mark}
    </span>
  );
}

function ListCardFace({
  list,
  currentUserId,
  isOwner,
  title,
  balance,
  memberMark,
  memberBadge,
}: {
  list: ListItem;
  currentUserId: string;
  isOwner: boolean;
  title: ReactNode;
  balance: ReactNode;
  memberMark: string;
  memberBadge: string;
}) {
  const roster = rosterForCard(list, currentUserId);
  return (
    <>
      {isOwner ? null : (
        <ListRoleBookmark mark={memberMark} label={memberBadge} />
      )}
      {title}
      <span className={styles.cardMiddle}>{balance}</span>
      <span className={styles.cardDivider} aria-hidden="true" />
      <span className={styles.chipRow}>
        {roster.map((member) => (
          <Chip
            key={member.user_id}
            tone={member.user_id === list.owner_id ? "accent" : "muted"}
          >
            {memberLabel(member)}
          </Chip>
        ))}
      </span>
    </>
  );
}

type Props = {
  initialLists: ListItem[];
  currentUserId: string;
};

export function ListsPanel({ initialLists, currentUserId }: Props) {
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  const router = useRouter();
  const [lists, setLists] = useState<ListItem[]>(initialLists);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [renameErrors, setRenameErrors] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [invitingListId, setInvitingListId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renamingIdRef = useRef<string | null>(null);

  const messages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorInvalidName: t.errorInvalidName,
      errorForbidden: t.errorForbidden,
      errorUnauthorized: t.errorUnauthorized,
      inviteTitle: t.inviteTitle,
      inviteLabel: t.inviteLabel,
      inviteSubmit: t.inviteSubmit,
      inviteSending: t.inviteSending,
      inviteSent: t.inviteSent,
    }),
    [t],
  ) as InviteFormMessages;

  const canCreate = newName.trim().length > 0 && !creating;

  const closeInviteSheet = useCallback(() => setInvitingListId(null), []);

  useEffect(() => {
    if (!editingId) return;
    const input = renameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editingId]);

  useEffect(() => {
    if (!editingId) return;
    const activeId = editingId;

    function onPointerDown(event: PointerEvent) {
      if (renamingIdRef.current === activeId) return;
      const input = renameInputRef.current;
      if (input && event.target instanceof Node && input.contains(event.target)) {
        return;
      }
      cancelRename(activeId);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editingId]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreateError(null);
    setCreating(true);
    try {
      const result = await createList(newName, messages);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setLists((prev) => [
        ...prev,
        {
          id: result.list.id,
          name: result.list.name,
          owner_id: result.list.owner_id,
          role: "owner",
          balance_crc: "0",
        },
      ]);
      setNewName("");
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  function startRename(list: ListItem) {
    if (renamingId || openingId) return;
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[list.id];
      return next;
    });
    setRenameDrafts((prev) => ({ ...prev, [list.id]: list.name }));
    setEditingId(list.id);
  }

  function cancelRename(listId: string) {
    if (renamingIdRef.current === listId) return;
    setEditingId((current) => (current === listId ? null : current));
    setRenameDrafts((prev) => {
      const next = { ...prev };
      delete next[listId];
      return next;
    });
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[listId];
      return next;
    });
  }

  async function commitRename(list: ListItem) {
    if (renamingIdRef.current === list.id) return;
    const draft = (renameDrafts[list.id] ?? list.name).trim();
    if (draft.length === 0) {
      setRenameErrors((prev) => ({ ...prev, [list.id]: t.errorInvalidName }));
      return;
    }
    if (draft === list.name) {
      cancelRename(list.id);
      return;
    }
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[list.id];
      return next;
    });
    renamingIdRef.current = list.id;
    setRenamingId(list.id);
    try {
      const result = await renameList(list.id, draft, messages);
      if (!result.ok) {
        setRenameErrors((prev) => ({ ...prev, [list.id]: result.error }));
        return;
      }
      setLists((prev) =>
        prev.map((item) =>
          item.id === list.id ? { ...item, name: result.list.name } : item,
        ),
      );
      setEditingId((current) => (current === list.id ? null : current));
      setRenameDrafts((prev) => {
        const next = { ...prev };
        delete next[list.id];
        return next;
      });
    } finally {
      renamingIdRef.current = null;
      setRenamingId(null);
    }
  }

  function onRenameKeyDown(event: KeyboardEvent<HTMLInputElement>, list: ListItem) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitRename(list);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename(list.id);
    }
  }

  function showDeleteConfirm(listId: string) {
    setDeleteConfirmId(listId);
    setOpenMenuId(null);
  }

  function cancelDeleteConfirm() {
    setDeleteConfirmId(null);
  }

  async function confirmDelete(list: ListItem) {
    if (deletingId === list.id || openingId || editingId) return;
    setDeletingId(list.id);
    try {
      const result = await deleteList(list.id, messages);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      setLists((prev) => prev.filter((item) => item.id !== list.id));
      setDeleteConfirmId(null);
    } finally {
      setDeletingId(null);
    }
  }

  async function openList(list: ListItem) {
    if (openingId || editingId) return;
    setOpeningId(list.id);
    try {
      const result = await setLastOpenedList(list.id, messages);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      router.push(`/lists/${encodeURIComponent(list.id)}`);
    } finally {
      setOpeningId(null);
    }
  }

  const anyOpening = openingId !== null;

  const startInvite = useCallback((listId: string) => {
    setInvitingListId(listId);
    setOpenMenuId(null);
  }, []);

  return (
    <>
      <div className={styles.panel}>
        <form className={styles.createForm} onSubmit={onCreate}>
          <label className={`${styles.label} ${styles.iconInputLabel}`}>
            {t.createLabel}
            <div className={styles.iconInputContainer}>
              <input
                className={styles.iconInput}
                type="text"
                name="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={200}
                autoComplete="off"
                disabled={creating}
                placeholder={t.createLabel}
              />
              <IconButton
                className={styles.iconButton}
                type="submit"
                disabled={!canCreate}
                label={creating ? t.creating : t.createSubmit}
                icon={<PlusIcon />}
              />
            </div>
          </label>
          {createError ? (
            <p className={styles.error} role="alert">
              {createError}
            </p>
          ) : null}
        </form>

        {lists.length === 0 ? (
          <p className={styles.copy}>{t.emptyHint}</p>
        ) : (
          <ul className={styles.list}>
            {lists.map((list) => {
              const isOwner = list.owner_id === currentUserId;
              const isEditing = editingId === list.id;
              const draft = renameDrafts[list.id] ?? list.name;
              const tone = balanceTone(list.balance_crc);
              const balance =
                tone === "zero" ? null : (
                  <span
                    className={`${styles.balance} ${
                      tone === "owe" ? styles.balanceOwe : styles.balanceOwed
                    }`}
                  >
                    <span className={styles.balanceToken}>
                      {tone === "owe" ? t.balanceOwe : t.balanceOwed}
                    </span>
                    <span className={styles.balanceAmount}>
                      {formatCardBalance(list.balance_crc)}
                    </span>
                  </span>
                );
              const faceProps = {
                list,
                currentUserId,
                isOwner,
                balance,
                memberMark: t.memberMark,
                memberBadge: t.memberBadge,
              };
              return (
                <li key={list.id} className={styles.row}>
                  {isEditing ? (
                    <div className={styles.cardBody}>
                      <ListCardFace
                        {...faceProps}
                        title={
                          <input
                            ref={renameInputRef}
                            className={styles.listNameEdit}
                            type="text"
                            value={draft}
                            placeholder={list.name}
                            aria-label={t.renameAria}
                            onChange={(e) =>
                              setRenameDrafts((prev) => ({
                                ...prev,
                                [list.id]: e.target.value,
                              }))
                            }
                            onBlur={() => cancelRename(list.id)}
                            onKeyDown={(e) => onRenameKeyDown(e, list)}
                            maxLength={200}
                            autoComplete="off"
                            disabled={renamingId === list.id}
                          />
                        }
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.cardButton}
                        onClick={() => void openList(list)}
                        disabled={anyOpening}
                        aria-label={`${t.openLink}: ${list.name}`}
                      >
                        <ListCardFace
                          {...faceProps}
                          title={
                            <span className={styles.listName}>{list.name}</span>
                          }
                        />
                      </button>
                      {isOwner ? (
                        <IconButtonPopup
                          className={styles.menuContainer}
                          panelClassName={
                            deleteConfirmId === list.id ? styles.confirmPanel : undefined
                          }
                          panelRole={deleteConfirmId === list.id ? "alertdialog" : "menu"}
                          open={openMenuId === list.id || deleteConfirmId === list.id}
                          onOpenChange={(next) => {
                            if (next) {
                              setOpenMenuId(list.id);
                              setDeleteConfirmId(null);
                            } else {
                              setOpenMenuId((current) =>
                                current === list.id ? null : current,
                              );
                              setDeleteConfirmId((current) =>
                                current === list.id ? null : current,
                              );
                            }
                          }}
                          button={
                            <IconButton
                              type="button"
                              variant="muted"
                              className={styles.renameIcon}
                              label={t.menuAria}
                              disabled={anyOpening || renamingId !== null}
                              icon={<DotsIcon />}
                            />
                          }
                        >
                          {deleteConfirmId === list.id ? (
                            <>
                              <p className={styles.confirmText}>{t.deleteConfirm}</p>
                              <div className={styles.confirmActions}>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  onClick={cancelDeleteConfirm}
                                  disabled={deletingId !== null}
                                >
                                  {t.deleteCancel}
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.primary} ${styles.primaryDanger}`}
                                  onClick={() => void confirmDelete(list)}
                                  disabled={deletingId !== null}
                                >
                                  {deletingId === list.id
                                    ? t.deletingAction
                                    : t.deleteAction}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <IconButtonPopupItem
                                onClick={() => startInvite(list.id)}
                                disabled={anyOpening}
                              >
                                {t.mobileInviteAria}
                              </IconButtonPopupItem>
                              <IconButtonPopupItem
                                onClick={() => startRename(list)}
                                disabled={anyOpening || renamingId !== null}
                              >
                                {t.renameLabel}
                              </IconButtonPopupItem>
                              <IconButtonPopupItem
                                danger
                                stayOpen
                                onClick={() => showDeleteConfirm(list.id)}
                                disabled={anyOpening || deletingId !== null}
                              >
                                {t.deleteAria}
                              </IconButtonPopupItem>
                            </>
                          )}
                        </IconButtonPopup>
                      ) : null}
                    </>
                  )}
                  {renameErrors[list.id] ? (
                    <p className={`${styles.error} ${styles.cardError}`} role="alert">
                      {renameErrors[list.id]}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {invitingListId ? (
        <Sheet
          open={invitingListId !== null}
          title={t.inviteTitle}
          closeLabel={t.mobileSheetClose}
          onClose={closeInviteSheet}
          body={
            <InviteForm
              listId={invitingListId}
              messages={messages}
              reserveErrorHeight
              hideBorder
            />
          }
        />
      ) : null}
    </>
  );
}
