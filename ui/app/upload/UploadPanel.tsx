"use client";

import { ChangeEvent, useEffect, useId, useRef, useState } from "react";

import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { uploadCopy } from "@/lib/i18n/upload";
import { UploadButton } from "./UploadButton";
import {
  uploadStatement,
  type ImportSession,
  type UploadMessages,
} from "./uploadClient";
import {
  forgetOpenImportSession,
  rememberOpenImportSession,
} from "./openImportSession";
import { SessionReviewPanel } from "./SessionReviewPanel";

export function UploadPanel({ initialSession = null }: { initialSession?: ImportSession | null }) {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<ImportSession | null>(initialSession);
  const [discarded, setDiscarded] = useState(false);

  const messages: UploadMessages = {
    errorUnsupportedFileType: t.errorUnsupportedFileType,
    errorUnknownStatement: t.errorUnknownStatement,
    errorAmbiguousStatement: t.errorAmbiguousStatement,
    errorUnreadableStatement: t.errorUnreadableStatement,
    errorGeneric: t.errorGeneric,
    errorUnauthorized: t.errorUnauthorized,
  };

  const upload = useFormSubmission(async (file: File) => {
    const result = await uploadStatement(file, messages);
    if (result.ok) {
      setSession(result.session);
      setDiscarded(false);
      rememberOpenImportSession(result.session.id);
    }
    return result;
  });

  useEffect(() => {
    if (initialSession) {
      rememberOpenImportSession(initialSession.id);
      return;
    }
    forgetOpenImportSession();
  }, [initialSession]);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || session) return;
    setDiscarded(false);
    await upload.submit(file);
  }

  return (
    <main
      className="min-h-full h-full flex flex-col"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      <h1 className="sr-only">{t.title}</h1>

      {session ? (
        <div className="flex flex-1 flex-col items-center justify-center px-[1.5rem] py-[2.5rem]">
          <SessionReviewPanel
            session={session}
            onSessionChanged={setSession}
            onDiscarded={() => {
              forgetOpenImportSession();
              setSession(null);
              setDiscarded(true);
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-[1.5rem] py-[2.5rem]">
          <div className="flex flex-col items-center">
            <UploadButton
              pending={upload.pending}
              label={t.uploadCta}
              pendingLabel={t.uploading}
              onClick={() => inputRef.current?.click()}
            />
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="application/pdf"
              disabled={upload.pending}
              onChange={onFileChange}
              className="sr-only"
              aria-label={t.pickFile}
            />
          </div>

          <div className="mt-6 min-h-[1.25rem] text-center" aria-live="polite">
            {upload.error ? (
              <p className="text-owe text-[0.9rem] m-0" role="alert">
                {upload.error}
              </p>
            ) : null}
            {discarded ? (
              <p className="text-muted text-[0.85rem] m-0">{t.discarded}</p>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}
