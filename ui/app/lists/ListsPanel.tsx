"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { usePreferences } from "@/components/PreferencesProvider";
import { useModalAnimation } from "@/hooks";
import { listsMessages } from "@/lib/i18n/lists";
import { DotsIcon, CloseIcon, PlusIcon } from "@/app/icons";
import type { InviteFormMessages } from "./InviteForm";
import { InviteForm } from "./InviteForm";
import {
  balanceTone,
  createList,
  deleteList,
  renameList,
  setLastOpenedList,
  type ListItem,
} from "./listsClient";
import styles from "./lists.module.css";

type Props = {
  initialLists: ListItem[];
  currentUserId: string;
};

function InviteSheet({
  open,
  listId,
  inviteMessages,
  closeLabel,
  onClose,
}: {
  open: boolean;
  listId: string;
  inviteMessages: InviteFormMessages;
  closeLabel: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { phase } = useModalAnimation(open, { closeAnimationMs: 280 });

  useEffect(() => {
    if (phase !== "open") return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
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
    };

    document.addEventListener("keydown", onKeyDown as unknown as EventListener);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown as unknown as EventListener);
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
            Invite Someone!
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
        <div className={styles.sheetBody}>
          <InviteForm listId={listId} messages={inviteMessages} reserveErrorHeight hideBorder />
        </div>
      </div>
    </>,
    document.body,
  );
}
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
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!openMenuId) return;

    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
        return;
      }
      setOpenMenuId(null);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenuId]);

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
              <button
                className={styles.iconButton}
                type="submit"
                disabled={!canCreate}
                aria-label={creating ? t.creating : t.createSubmit}
              >
                <PlusIcon />
              </button>
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
              const balanceLabel =
                tone === "owe"
                  ? t.balanceOwe
                  : tone === "owed"
                    ? t.balanceOwed
                    : t.balanceZero;
              return (
                <li key={list.id} className={styles.row}>
                  {isEditing ? (
                    <div className={styles.cardBody}>
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
                      <span className={styles.badge}>
                        {isOwner ? t.ownedBadge : t.memberBadge}
                      </span>
                      <span className={styles.cardDivider} aria-hidden="true" />
                      <span
                        className={`${styles.balance} ${tone === "owe"
                            ? styles.balanceOwe
                            : tone === "owed"
                              ? styles.balanceOwed
                              : styles.balanceZero
                          }`}
                      >
                        <span className={styles.balanceToken}>{balanceLabel}</span>
                        <span className={styles.balanceAmount}>
                          {list.balance_crc ?? "0"}
                        </span>
                      </span>
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
                        <span className={styles.listName}>{list.name}</span>
                        <span className={styles.badge}>
                          {isOwner ? t.ownedBadge : t.memberBadge}
                        </span>
                        <span className={styles.cardDivider} aria-hidden="true" />
                        <span
                          className={`${styles.balance} ${tone === "owe"
                              ? styles.balanceOwe
                              : tone === "owed"
                                ? styles.balanceOwed
                                : styles.balanceZero
                            }`}
                        >
                          <span className={styles.balanceToken}>{balanceLabel}</span>
                          <span className={styles.balanceAmount}>
                            {list.balance_crc ?? "0"}
                          </span>
                        </span>
                      </button>
                      {isOwner ? (
                        <div className={styles.menuContainer} ref={menuRef}>
                          <button
                            type="button"
                            className={styles.renameIcon}
                            aria-label={t.menuAria}
                            onClick={() => setOpenMenuId(openMenuId === list.id ? null : list.id)}
                            disabled={anyOpening || renamingId !== null}
                            aria-expanded={openMenuId === list.id}
                            aria-haspopup="menu"
                          >
                            <DotsIcon />
                          </button>
                          {openMenuId === list.id && deleteConfirmId !== list.id && (
                            <div className={styles.menu} role="menu">
                              <button
                                type="button"
                                className={styles.menuItem}
                                onClick={() => startInvite(list.id)}
                                disabled={anyOpening}
                                role="menuitem"
                              >
                                {t.mobileInviteAria}
                              </button>
                              <button
                                type="button"
                                className={styles.menuItem}
                                onClick={() => {
                                  startRename(list);
                                  setOpenMenuId(null);
                                }}
                                disabled={anyOpening || renamingId !== null}
                                role="menuitem"
                              >
                                {t.renameLabel}
                              </button>
                              <button
                                type="button"
                                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                onClick={() => showDeleteConfirm(list.id)}
                                disabled={anyOpening || deletingId !== null}
                                role="menuitem"
                              >
                                {t.deleteAria}
                              </button>
                            </div>
                          )}
                          {deleteConfirmId === list.id && (
                            <div className={styles.confirmPopover} role="alertdialog">
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
                                  {deletingId === list.id ? t.deletingAction : t.deleteAction}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
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
        <InviteSheet
          open={invitingListId !== null}
          listId={invitingListId}
          inviteMessages={messages}
          closeLabel={t.mobileSheetClose}
          onClose={closeInviteSheet}
        />
      ) : null}
    </>
  );
}
