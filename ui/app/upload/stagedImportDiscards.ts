"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_PREFIX = "finance-helper.staged-import-discards.";

export type StagedImportDiscards = {
  deleteIds: string[];
  sheetDiscardIds: string[];
  lastCardStagedId: string | null;
};

const EMPTY: StagedImportDiscards = {
  deleteIds: [],
  sheetDiscardIds: [],
  lastCardStagedId: null,
};

const listeners = new Set<() => void>();

function storageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`;
}

function emit() {
  for (const listener of listeners) listener();
}

function parse(raw: string): StagedImportDiscards {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw) as Partial<StagedImportDiscards>;
    return {
      deleteIds: Array.isArray(parsed.deleteIds)
        ? parsed.deleteIds.filter((id): id is string => typeof id === "string")
        : [],
      sheetDiscardIds: Array.isArray(parsed.sheetDiscardIds)
        ? parsed.sheetDiscardIds.filter((id): id is string => typeof id === "string")
        : [],
      lastCardStagedId:
        typeof parsed.lastCardStagedId === "string" ? parsed.lastCardStagedId : null,
    };
  } catch {
    return EMPTY;
  }
}

function write(sessionId: string, next: StagedImportDiscards) {
  const empty =
    next.deleteIds.length === 0 && next.sheetDiscardIds.length === 0 && next.lastCardStagedId === null;
  const serialized = empty ? "" : JSON.stringify(next);
  try {
    // localStorage (not sessionStorage): a staged card-delete must survive a
    // closed tab, and a native "storage" event only ever fires for
    // localStorage — that event is what lets a sibling tab on the same
    // session notice a change made in this one.
    if (empty) localStorage.removeItem(storageKey(sessionId));
    else localStorage.setItem(storageKey(sessionId), serialized);
    memoryFallback.delete(sessionId);
  } catch {
    /* private mode / disabled storage — staging still works in-memory via emit */
    memoryFallback.set(sessionId, serialized);
  }
  emit();
}

/** In-memory mirror so a failed localStorage write still notifies subscribers. */
const memoryFallback = new Map<string, string>();

function snapshot(sessionId: string): string {
  try {
    const stored = localStorage.getItem(storageKey(sessionId));
    if (stored !== null) return stored;
  } catch {
    /* fall through to memory */
  }
  return memoryFallback.get(sessionId) ?? "";
}

export function getStagedImportDiscards(sessionId: string): StagedImportDiscards {
  return parse(snapshot(sessionId));
}

export function subscribeStagedImportDiscards(listener: () => void): () => void {
  listeners.add(listener);
  // The native "storage" event only fires in *other* tabs/documents of the
  // same origin, never the one that made the write — this is what lets a
  // sibling tab reconcile onto a Save/finalize/discard made elsewhere;
  // same-tab reactivity still goes through the in-memory `emit()` above.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function stageCardDiscard(sessionId: string, rowId: string) {
  const current = getStagedImportDiscards(sessionId);
  write(sessionId, {
    deleteIds: current.deleteIds.includes(rowId)
      ? current.deleteIds
      : [...current.deleteIds, rowId],
    sheetDiscardIds: current.sheetDiscardIds.filter((id) => id !== rowId),
    lastCardStagedId: rowId,
  });
}

export function stageSheetDiscards(sessionId: string, rowIds: string[]) {
  if (rowIds.length === 0) return;
  const current = getStagedImportDiscards(sessionId);
  const sheetDiscardIds = [...current.sheetDiscardIds];
  for (const id of rowIds) {
    if (!sheetDiscardIds.includes(id) && !current.deleteIds.includes(id)) sheetDiscardIds.push(id);
  }
  write(sessionId, { ...current, sheetDiscardIds });
}

export function restoreStagedDiscard(sessionId: string, rowId: string) {
  const current = getStagedImportDiscards(sessionId);
  write(sessionId, {
    deleteIds: current.deleteIds.filter((id) => id !== rowId),
    sheetDiscardIds: current.sheetDiscardIds.filter((id) => id !== rowId),
    lastCardStagedId: current.lastCardStagedId === rowId ? null : current.lastCardStagedId,
  });
}

export function clearLastCardStagedDiscard(sessionId: string) {
  const current = getStagedImportDiscards(sessionId);
  if (!current.lastCardStagedId) return;
  write(sessionId, { ...current, lastCardStagedId: null });
}

export function clearStagedImportDiscards(sessionId: string) {
  write(sessionId, EMPTY);
}

export function useStagedImportDiscards(sessionId: string) {
  const subscribe = useCallback((listener: () => void) => subscribeStagedImportDiscards(listener), []);
  const getSnapshot = useCallback(() => snapshot(sessionId), [sessionId]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const staged = useMemo(() => parse(raw), [raw]);
  const discardedIds = useMemo(
    () => new Set([...staged.deleteIds, ...staged.sheetDiscardIds]),
    [staged.deleteIds, staged.sheetDiscardIds],
  );
  return { staged, discardedIds };
}
