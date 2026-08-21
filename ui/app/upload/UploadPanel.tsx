"use client";

import { ChangeEvent, useId, useState } from "react";

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
      className="py-[2.5rem] px-[1.5rem]"
      style={{ fontFamily: "var(--font-ui), Manrope, system-ui, sans-serif" }}
    >
      <h1 className="m-0 mb-[1.75rem] text-[1.75rem] font-[550] text-foreground">{t.title}</h1>

      <div className="flex flex-col gap-4 max-w-[28rem]">
        <label
          htmlFor={inputId}
          className="inline-block"
        >
          <span className="sr-only">{t.pickFile}</span>
          <input
            id={inputId}
            type="file"
            accept="application/pdf"
            disabled={upload.pending || !!session}
            onChange={onFileChange}
            className="block w-full text-[0.9rem] text-foreground file:mr-3 file:py-[9px] file:px-3 file:rounded-sm file:border-none file:bg-accent file:text-on-accent file:cursor-pointer disabled:opacity-55"
          />
        </label>

        <div aria-live="polite">
          {upload.pending ? (
            <p className="text-muted text-[0.85rem] m-0">{t.uploading}</p>
          ) : null}
          {!upload.pending && session ? (
            <p className="text-muted text-[0.85rem] m-0">{t.activeSessionBlocksUpload}</p>
          ) : null}
          {upload.error ? (
            <p className="text-owe text-[0.9rem] m-0" role="alert">
              {upload.error}
            </p>
          ) : null}
          {discarded ? <p className="text-muted text-[0.85rem] m-0">{t.discarded}</p> : null}
        </div>

        {session ? (
          <div className="mt-4">
            <SessionReviewPanel
              session={session}
              onSessionChanged={setSession}
              onDiscarded={() => {
                setSession(null);
                setDiscarded(true);
              }}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
