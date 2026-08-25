const STORAGE_KEY = "finance-helper.open-import-session-id";
const DISCARDED_KEY = "finance-helper.discarded-import-session-ids";

/** Remember the in-flight import so leaving Home/Account does not lose it. */
export function rememberOpenImportSession(sessionId: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, sessionId);
  } catch {
    /* private mode / disabled storage — resume is a convenience */
  }
}

export function peekOpenImportSessionId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function forgetOpenImportSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function readDiscardedIds(): string[] {
  try {
    const raw = sessionStorage.getItem(DISCARDED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeDiscardedIds(ids: string[]) {
  try {
    if (ids.length === 0) sessionStorage.removeItem(DISCARDED_KEY);
    else sessionStorage.setItem(DISCARDED_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / disabled storage */
  }
}

/** Close on /upload removes the row from tab memory; a reload re-seeds from
 * a possibly stale RSC `initialSession`. Remember ids we already discarded
 * so that seed does not resurrect them. */
export function rememberDiscardedImportSession(sessionId: string) {
  const ids = readDiscardedIds();
  if (!ids.includes(sessionId)) writeDiscardedIds([...ids, sessionId]);
}

export function isDiscardedImportSession(sessionId: string): boolean {
  return readDiscardedIds().includes(sessionId);
}

export function forgetDiscardedImportSession(sessionId: string) {
  writeDiscardedIds(readDiscardedIds().filter((id) => id !== sessionId));
}
