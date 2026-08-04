"use client";

import { FormEvent, useMemo, useState } from "react";

import { usePreferences } from "@/components/PreferencesProvider";
import { listsMessages } from "@/lib/i18n/lists";
import {
  createList,
  renameList,
  type ListItem,
} from "./listsClient";
import styles from "./lists.module.css";

type Props = {
  initialLists: ListItem[];
};

export function ListsPanel({ initialLists }: Props) {
  const { locale } = usePreferences();
  const t = listsMessages[locale];
  const [lists, setLists] = useState<ListItem[]>(initialLists);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [renameErrors, setRenameErrors] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);

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

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        },
      ]);
      setNewName("");
    } finally {
      setCreating(false);
    }
  }

  async function onRename(event: FormEvent<HTMLFormElement>, list: ListItem) {
    event.preventDefault();
    const draft = (renameDrafts[list.id] ?? list.name).trim();
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[list.id];
      return next;
    });
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
      setRenameDrafts((prev) => {
        const next = { ...prev };
        delete next[list.id];
        return next;
      });
    } finally {
      setRenamingId(null);
    }
  }

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
            const isOwner = list.role === "owner";
            const draft = renameDrafts[list.id] ?? list.name;
            return (
              <li key={list.id} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles.listName}>{list.name}</span>
                  <span className={styles.badge}>
                    {isOwner ? t.ownedBadge : t.memberBadge}
                  </span>
                </div>
                {isOwner ? (
                  <form
                    className={styles.renameForm}
                    onSubmit={(e) => onRename(e, list)}
                  >
                    <label className={`${styles.label} ${styles.renameField}`}>
                      {t.renameLabel}
                      <input
                        className={styles.input}
                        type="text"
                        value={draft}
                        onChange={(e) =>
                          setRenameDrafts((prev) => ({
                            ...prev,
                            [list.id]: e.target.value,
                          }))
                        }
                        maxLength={200}
                        autoComplete="off"
                        disabled={renamingId === list.id}
                      />
                    </label>
                    <button
                      className={styles.secondary}
                      type="submit"
                      disabled={
                        renamingId === list.id ||
                        draft.trim().length === 0 ||
                        draft.trim() === list.name
                      }
                    >
                      {renamingId === list.id ? t.saving : t.renameSubmit}
                    </button>
                    {renameErrors[list.id] ? (
                      <p className={styles.error} role="alert">
                        {renameErrors[list.id]}
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
