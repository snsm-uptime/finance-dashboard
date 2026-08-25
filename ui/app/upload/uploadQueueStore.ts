import type { ImportSession } from "./uploadClient";

/** Tab-lifetime queue so review navigation does not drop sibling files (Story 4.16). */

export type UploadQueueState = "pending" | "uploading" | "staged" | "failed" | "duplicate";

export type UploadQueueEntry = {
  id: string;
  file?: File;
  contentHash?: string;
  fallbackKey?: string;
  state: UploadQueueState;
  session?: ImportSession;
  error?: string;
  displayName: string;
};

const REVIEWABLE = new Set<UploadQueueState>(["pending", "uploading", "staged", "failed"]);

let entries: UploadQueueEntry[] = [];

export function readUploadQueue(): UploadQueueEntry[] {
  return entries;
}

export function writeUploadQueue(next: UploadQueueEntry[]): void {
  // Duplicate hits are a same-visit notice only — drop them so they are gone
  // the next time this screen hydrates.
  entries = next.filter((entry) => entry.state !== "duplicate");
}

export function resetUploadQueue(): void {
  entries = [];
}

export function removeUploadQueueSession(sessionId: string): void {
  entries = entries.filter((entry) => entry.session?.id !== sessionId);
}

export function hasRemainingUploadWork(excludeSessionId?: string): boolean {
  return entries.some((entry) => {
    if (!REVIEWABLE.has(entry.state)) return false;
    if (excludeSessionId && entry.session?.id === excludeSessionId) return false;
    return true;
  });
}
