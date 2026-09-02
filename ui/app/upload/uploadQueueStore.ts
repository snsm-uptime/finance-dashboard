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
  duplicateSessionId?: string;
  error?: string;
  displayName: string;
};

const REVIEWABLE = new Set<UploadQueueState>(["pending", "uploading", "staged", "failed"]);

let entries: UploadQueueEntry[] = [];
// Peak concurrent queue size this tab-lifetime batch ever reached. Sibling
// entries are removed one at a time as each file finishes review, so by the
// time the last file of a multi-file batch is reached, `entries` alone can
// no longer tell it apart from a solo upload — this survives that pruning.
let peakEntryCount = 0;

export function readUploadQueue(): UploadQueueEntry[] {
  return entries;
}

export function writeUploadQueue(next: UploadQueueEntry[]): void {
  // Duplicate hits are a same-visit notice only — drop them so they are gone
  // the next time this screen hydrates.
  entries = next.filter((entry) => entry.state !== "duplicate");
  peakEntryCount = Math.max(peakEntryCount, entries.length);
}

/** True if this batch never had more than one file queued at once. */
export function wasSoloUpload(): boolean {
  return peakEntryCount <= 1;
}

export function resetUploadQueue(): void {
  entries = [];
  peakEntryCount = 0;
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
