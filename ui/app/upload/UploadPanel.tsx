"use client";

import { ChangeEvent, useId, useState } from "react";

import { PrimaryButton } from "@/components/soft-ledger/PrimaryButton";
import { usePreferences } from "@/components/PreferencesProvider";
import { useFormSubmission } from "@/hooks";
import { uploadCopy } from "@/lib/i18n/upload";
import {
  discardSession,
  uploadStatement,
  type ImportSession,
  type UploadMessages,
} from "./uploadClient";

const statusBadgeClass =
  "inline-block py-[2px] px-2 rounded-full border text-[0.75rem] font-[550]";
const statusStagedClass = `${statusBadgeClass} border-owed text-owed`;
const statusFailedClass = `${statusBadgeClass} border-owe text-owe`;

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

  const discard = useFormSubmission(async (sessionId: string) => {
    const result = await discardSession(sessionId, messages);
    if (result.ok) {
      setSession(null);
      setDiscarded(true);
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
          {discard.error ? (
            <p className="text-owe text-[0.9rem] m-0" role="alert">
              {discard.error}
            </p>
          ) : null}
          {discarded ? <p className="text-muted text-[0.85rem] m-0">{t.discarded}</p> : null}
        </div>

        {session ? (
          <section aria-label={t.title}>
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              {session.statements.map((statement) => (
                <li
                  key={statement.id}
                  className="flex items-center justify-between gap-3 py-[0.6rem] px-[0.85rem] rounded-[8px] border border-border bg-surface"
                >
                  <span className="font-[550] text-foreground text-[0.95rem]">
                    {statement.product_id}
                  </span>
                  <span
                    className={
                      statement.status === "staged" ? statusStagedClass : statusFailedClass
                    }
                  >
                    {statement.status === "staged" ? t.statementStaged : t.statementFailed}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-4">
              <PrimaryButton
                disabled={discard.pending}
                onClick={() => discard.submit(session.id)}
              >
                {discard.pending ? t.discarding : t.discard}
              </PrimaryButton>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
