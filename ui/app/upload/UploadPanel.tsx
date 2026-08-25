"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useId, useRef, useState } from "react";

import { IconButton } from "@/components/IconButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { AlertIcon, CloseIcon, SpinnerIcon } from "@/app/icons";
import { uploadCopy } from "@/lib/i18n/upload";
import { UploadButton } from "./UploadButton";
import {
  discardSession,
  uploadStatement,
  type ImportSession,
  type UploadMessages,
} from "./uploadClient";
import {
  forgetOpenImportSession,
  rememberOpenImportSession,
} from "./openImportSession";
import {
  readUploadQueue,
  writeUploadQueue,
  type UploadQueueEntry,
} from "./uploadQueueStore";

const QUEUE_CAP = 10;
const ACTIVE_STATES = new Set(["pending", "uploading", "staged"]);

type QueueEntry = UploadQueueEntry;

function newEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashFile(file: File): Promise<{ contentHash?: string; fallbackKey: string }> {
  const fallbackKey = `${file.name}:${file.size}:${file.lastModified}`;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return { fallbackKey };
  try {
    const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
    return { contentHash: bytesToHex(digest), fallbackKey };
  } catch {
    return { fallbackKey };
  }
}

function reviewHrefFor(entry: QueueEntry): string | null {
  const sessionId =
    entry.state === "staged" && entry.session ? entry.session.id : entry.duplicateSessionId;
  if (!sessionId) return null;
  return `/upload/review/${encodeURIComponent(sessionId)}`;
}

function isInQueueDuplicate(
  queue: QueueEntry[],
  hashed: { contentHash?: string; fallbackKey: string },
): boolean {
  return queue.some((entry) => {
    if (!ACTIVE_STATES.has(entry.state)) return false;
    if (hashed.contentHash && entry.contentHash) {
      return entry.contentHash === hashed.contentHash;
    }
    return entry.fallbackKey === hashed.fallbackKey;
  });
}

function activeCount(queue: QueueEntry[]): number {
  return queue.filter((entry) => ACTIVE_STATES.has(entry.state)).length;
}

function lastStagedSessionId(queue: QueueEntry[]): string | null {
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const entry = queue[index];
    if (entry.state === "staged" && entry.session) return entry.session.id;
  }
  return null;
}

function rememberLastStaged(queue: QueueEntry[]) {
  const id = lastStagedSessionId(queue);
  if (id) rememberOpenImportSession(id);
  else forgetOpenImportSession();
}

function seedFromSession(initialSession: ImportSession): QueueEntry {
  return {
    id: initialSession.id,
    state: "staged",
    session: initialSession,
    displayName: initialSession.statements[0]?.filename ?? initialSession.id,
  };
}

function initialQueue(initialSession: ImportSession | null): QueueEntry[] {
  const stored = readUploadQueue();
  if (stored.length > 0) {
    if (
      initialSession &&
      !stored.some((entry) => entry.session?.id === initialSession.id)
    ) {
      return [...stored, seedFromSession(initialSession)];
    }
    return stored;
  }
  return initialSession ? [seedFromSession(initialSession)] : [];
}

export function UploadPanel({ initialSession = null }: { initialSession?: ImportSession | null }) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueueEntry[]>(() => initialQueue(initialSession));
  const queueRef = useRef<QueueEntry[]>(queue);
  const drainingRef = useRef(false);
  const aliveRef = useRef(true);
  const pickChainRef = useRef(Promise.resolve());
  const [capMessage, setCapMessage] = useState<string | null>(null);

  const messages: UploadMessages = {
    errorUnsupportedFileType: t.errorUnsupportedFileType,
    errorUnknownStatement: t.errorUnknownStatement,
    errorAmbiguousStatement: t.errorAmbiguousStatement,
    errorUnreadableStatement: t.errorUnreadableStatement,
    errorDuplicateStatement: t.errorDuplicateStatement,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  function commitQueue(next: QueueEntry[]) {
    queueRef.current = next;
    writeUploadQueue(next);
    if (aliveRef.current) setQueue(next);
  }

  function patchEntry(id: string, patch: Partial<QueueEntry>) {
    commitQueue(queueRef.current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }

  async function drainQueue() {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      for (;;) {
        const next = queueRef.current.find((entry) => entry.state === "pending" && entry.file);
        if (!next || !next.file) break;
        patchEntry(next.id, { state: "uploading", error: undefined });
        let result: Awaited<ReturnType<typeof uploadStatement>>;
        try {
          result = await uploadStatement(next.file, messages);
        } catch {
          result = { ok: false, error: messages.errorGeneric };
        }
        if (result?.ok) {
          const updated = queueRef.current.map((entry) =>
            entry.id === next.id
              ? {
                  ...entry,
                  state: "staged" as const,
                  session: result.session,
                  file: undefined,
                  error: undefined,
                  displayName: result.session.statements[0]?.filename ?? next.displayName,
                }
              : entry,
          );
          commitQueue(updated);
          rememberOpenImportSession(result.session.id);
        } else {
          const isDuplicate = result.error === messages.errorDuplicateStatement;
          patchEntry(next.id, {
            state: isDuplicate ? "duplicate" : "failed",
            error: result.error,
            file: undefined,
            duplicateSessionId: result.duplicateSessionId,
          });
        }
      }
    } finally {
      drainingRef.current = false;
      if (queueRef.current.some((entry) => entry.state === "pending")) {
        void drainQueue();
      }
    }
  }

  useEffect(() => {
    aliveRef.current = true;
    const recovered = queueRef.current.map((entry) =>
      entry.state === "uploading" && entry.file ? { ...entry, state: "pending" as const } : entry,
    );
    commitQueue(recovered);
    void drainQueue();
    return () => {
      aliveRef.current = false;
    };
    // Resume leftover pending/uploading uploads after returning from review.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only drain
  }, []);

  useEffect(() => {
    rememberLastStaged(queueRef.current);
  }, [initialSession]);

  async function enqueueFiles(picked: File[]) {
    setCapMessage(null);
    const additions: QueueEntry[] = [];
    let overflow = false;
    let occupied = activeCount(queueRef.current);

    for (const file of picked) {
      const hashed = await hashFile(file);
      const against = [...queueRef.current, ...additions];
      if (isInQueueDuplicate(against, hashed)) {
        additions.push({
          id: newEntryId(),
          ...hashed,
          state: "duplicate",
          displayName: file.name,
          error: t.errorAlreadyQueued,
        });
        continue;
      }
      if (occupied >= QUEUE_CAP) {
        overflow = true;
        continue;
      }
      occupied += 1;
      additions.push({
        id: newEntryId(),
        file,
        ...hashed,
        state: "pending",
        displayName: file.name,
      });
    }

    if (additions.length > 0) {
      commitQueue([...queueRef.current, ...additions]);
    }
    if (overflow && aliveRef.current) setCapMessage(t.queueCap);
    void drainQueue();
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    // Snapshot before clearing — FileList is live and becomes empty when value is reset.
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    pickChainRef.current = pickChainRef.current.then(() => enqueueFiles(picked)).catch(() => undefined);
  }

  function removePending(id: string) {
    commitQueue(queueRef.current.filter((entry) => entry.id !== id));
  }

  async function discardStaged(id: string, sessionId: string) {
    const result = await discardSession(sessionId, messages);
    if (!result.ok) {
      patchEntry(id, { error: result.error });
      return;
    }
    const remaining = queueRef.current.filter(
      (entry) =>
        entry.id !== id &&
        entry.session?.id !== sessionId &&
        entry.duplicateSessionId !== sessionId,
    );
    commitQueue(remaining);
    rememberLastStaged(remaining);
  }

  const uploading = queue.some((entry) => entry.state === "uploading");

  return (
    <main
      className="min-h-full h-full flex flex-col"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      <h1 className="sr-only">{t.title}</h1>

      <div className="flex-1 flex flex-col items-center justify-center px-[1.5rem] py-[2.5rem]">
        <div className="flex flex-col items-center">
          <UploadButton
            pending={uploading}
            label={t.uploadCta}
            pendingLabel={t.uploading}
            onClick={() => inputRef.current?.click()}
          />
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            accept="application/pdf"
            onChange={onFileChange}
            className="sr-only"
            aria-label={t.pickFile}
          />
        </div>

        <div className="mt-6 w-full max-w-[26rem]" aria-live="polite">
          {capMessage ? (
            <p className="text-owe text-[0.9rem] m-0 mb-3 text-center" role="alert">
              {capMessage}
            </p>
          ) : null}
          {queue.length > 0 ? (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {queue.map((entry) => {
                const reviewHref = reviewHrefFor(entry);
                const discardSessionId = entry.session?.id ?? entry.duplicateSessionId;
                return (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      {reviewHref ? (
                        <Link
                          href={reviewHref}
                          className="block truncate text-[0.9rem] text-foreground no-underline"
                          aria-label={`${t.resumeReview}: ${entry.displayName}`}
                        >
                          {entry.displayName}
                        </Link>
                      ) : (
                        <p className="m-0 truncate text-[0.9rem] text-foreground">
                          {entry.displayName}
                        </p>
                      )}
                      {entry.error && entry.state !== "duplicate" ? (
                        <p className="m-0 mt-1 text-owe text-[0.8rem]" role="alert">
                          {entry.error}
                        </p>
                      ) : null}
                    </div>
                    {entry.state === "pending" || entry.state === "failed" ? (
                      <IconButton
                        variant="ghost"
                        label={t.removePending}
                        icon={<CloseIcon className="size-5" />}
                        onClick={() => removePending(entry.id)}
                      />
                    ) : null}
                    {entry.state === "uploading" ? (
                      <span
                        className="grid size-5 shrink-0 place-items-center"
                        aria-label={t.uploading}
                        aria-busy="true"
                      >
                        <SpinnerIcon className="col-start-1 row-start-1 size-5 animate-spin motion-reduce:animate-none" />
                      </span>
                    ) : null}
                    {reviewHref && discardSessionId ? (
                      <IconButton
                        variant="ghost"
                        label={t.close}
                        icon={<CloseIcon className="size-5" />}
                        onClick={() => {
                          void discardStaged(entry.id, discardSessionId);
                        }}
                      />
                    ) : null}
                    {entry.state === "duplicate" ? (
                      <span
                        className="group relative shrink-0 text-owe"
                        tabIndex={0}
                        aria-label={entry.error ?? t.errorDuplicateStatement}
                      >
                        <AlertIcon className="block size-5" />
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden w-max max-w-[16rem] rounded-sm bg-foreground px-2 py-1 text-left text-[0.75rem] leading-snug text-background group-hover:block group-focus-visible:block"
                        >
                          {entry.error ?? t.errorDuplicateStatement}
                        </span>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </main>
  );
}
