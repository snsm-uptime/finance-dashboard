"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

const STORAGE_PREFIX = "finance-helper.staged-import-discards.";

export type StagedImportDiscards = {
  deleteIds: string[];
  unassignIds: string[];
  lastCardStagedId: string | null;
};

const EMPTY: StagedImportDiscards = {
  deleteIds: [],
  unassignIds: [],
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
      unassignIds: Array.isArray(parsed.unassignIds)
        ? parsed.unassignIds.filter((id): id is string => typeof id === "string")
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
    next.deleteIds.length === 0 && next.unassignIds.length === 0 && next.lastCardStagedId === null;
  const serialized = empty ? "" : JSON.stringify(next);
  try {
    if (empty) sessionStorage.removeItem(storageKey(sessionId));
    else sessionStorage.setItem(storageKey(sessionId), serialized);
    memoryFallback.delete(sessionId);
  } catch {
    /* private mode / disabled storage — staging still works in-memory via emit */
    memoryFallback.set(sessionId, serialized);
  }
  emit();
}

/** In-memory mirror so a failed sessionStorage write still notifies subscribers. */
const memoryFallback = new Map<string, string>();

function snapshot(sessionId: string): string {
  try {
    const stored = sessionStorage.getItem(storageKey(sessionId));
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
  return () => {
    listeners.delete(listener);
  };
}

export function stageCardDiscard(sessionId: string, rowId: string) {
  const current = getStagedImportDiscards(sessionId);
  write(sessionId, {
    deleteIds: current.deleteIds.includes(rowId)
      ? current.deleteIds
      : [...current.deleteIds, rowId],
    unassignIds: current.unassignIds.filter((id) => id !== rowId),
    lastCardStagedId: rowId,
  });
}

export function stageSheetDiscards(sessionId: string, rowIds: string[]) {
  if (rowIds.length === 0) return;
  const current = getStagedImportDiscards(sessionId);
  const unassignIds = [...current.unassignIds];
  for (const id of rowIds) {
    if (!unassignIds.includes(id) && !current.deleteIds.includes(id)) unassignIds.push(id);
  }
  write(sessionId, { ...current, unassignIds });
}

export function restoreStagedDiscard(sessionId: string, rowId: string) {
  const current = getStagedImportDiscards(sessionId);
  write(sessionId, {
    deleteIds: current.deleteIds.filter((id) => id !== rowId),
    unassignIds: current.unassignIds.filter((id) => id !== rowId),
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
    () => new Set([...staged.deleteIds, ...staged.unassignIds]),
    [staged.deleteIds, staged.unassignIds],
  );
  return { staged, discardedIds };
}
