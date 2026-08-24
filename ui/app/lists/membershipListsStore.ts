"use client";

import { useSyncExternalStore } from "react";

import type { ListItem } from "./listsClient";

let snapshot: ListItem[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeMembershipLists(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function getMembershipListsSnapshot(): ListItem[] | null {
  return snapshot;
}

/** Replace the in-memory membership roster (GET /lists or first paint). */
export function replaceMembershipLists(next: ListItem[]): void {
  snapshot = next;
  emit();
}

export function patchMembershipLists(update: (prev: ListItem[]) => ListItem[]): void {
  snapshot = update(snapshot ?? []);
  emit();
}

export function resetMembershipListsStore(): void {
  snapshot = null;
  emit();
}

export function useMembershipLists(): ListItem[] | null {
  return useSyncExternalStore(
    subscribeMembershipLists,
    getMembershipListsSnapshot,
    () => null,
  );
}
