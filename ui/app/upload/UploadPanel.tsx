"use client";

import { ChangeEvent, useId, useRef, useState } from "react";

import { FileIcon } from "@/app/icons";
import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { uploadCopy } from "@/lib/i18n/upload";
import {
  uploadStatement,
  type ImportSession,
  type UploadMessages,
} from "./uploadClient";
import { SessionReviewPanel } from "./SessionReviewPanel";

export function UploadPanel() {
  const { locale } = usePreferences();
  const t = uploadCopy(locale);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [session, setSession] = useState<ImportSession | null>(null);
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
    }
    return result;
  });

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
        <div className="py-[2.5rem] px-[1.5rem]">
          <SessionReviewPanel
            session={session}
            onSessionChanged={setSession}
            onDiscarded={() => {
              setSession(null);
              setDiscarded(true);
            }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-[1.5rem] py-[2.5rem]">
          <div className="flex flex-col items-center gap-6">
            <FileIcon className="w-28 h-28 text-muted" />
            <PrimaryButton
              disabled={upload.pending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.pending ? t.uploading : t.uploadCta}
            </PrimaryButton>
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
