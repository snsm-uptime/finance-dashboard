"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { usePreferences } from "@/components/PreferencesProvider";
import { listsMessages } from "@/lib/i18n/lists";
import {
  balanceTone,
  createList,
  renameList,
  setLastOpenedList,
  type ListItem,
} from "./listsClient";
import styles from "./lists.module.css";

type Props = {
  initialLists: ListItem[];
  currentUserId: string;
};

function PencilIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M11.5 1.5a1.414 1.414 0 0 1 2 2L5.5 11.5 2 12.5l1-3.5L11.5 1.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 2.75 13.25 5.75"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
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
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renamingIdRef = useRef<string | null>(null);

  const messages = useMemo(
    () => ({
      errorGeneric: t.errorGeneric,
      errorInvalidName: t.errorInvalidName,
      errorForbidden: t.errorForbidden,
      errorUnauthorized: t.errorUnauthorized,
    }),
    [t],
  );

  const canCreate = newName.trim().length > 0 && !creating;

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

  return (
    <div className={styles.panel}>
      <form className={styles.createForm} onSubmit={onCreate}>
        <div className={styles.createRow}>
          <label className={`${styles.label} ${styles.createField}`}>
            {t.createLabel}
            <input
              className={styles.input}
              type="text"
              name="name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={200}
              autoComplete="off"
              disabled={creating}
            />
          </label>
          <button className={styles.primary} type="submit" disabled={!canCreate}>
            {creating ? t.creating : t.createSubmit}
          </button>
        </div>
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
                      className={`${styles.balance} ${
                        tone === "owe"
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
                        className={`${styles.balance} ${
                          tone === "owe"
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
                      <button
                        type="button"
                        className={styles.renameIcon}
                        aria-label={t.renameAria}
                        onClick={() => startRename(list)}
                        disabled={anyOpening || renamingId !== null}
                      >
                        <PencilIcon />
                      </button>
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
  );
}
