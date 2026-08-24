const STORAGE_KEY = "finance-helper.open-import-session-id";

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
