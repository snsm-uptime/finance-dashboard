/** Upload PDF → Import Session copy — EN/ES (Story 4.6, FR-13/14/15). */
import type { Locale } from "@/lib/i18n/locale";

export const uploadMessages = {
  en: {
    title: "Upload",
    pickFile: "Choose PDF",
    uploading: "Uploading…",
    statementStaged: "Staged",
    statementFailed: "Could not parse this statement",
    discard: "Discard",
    discarding: "Discarding…",
    discarded: "Discarded.",
    activeSessionBlocksUpload: "Discard this session before uploading another statement.",
    errorUnsupportedFileType: "Only PDF files are supported.",
    errorUnknownStatement: "Could not recognize the bank or card for this file.",
    errorAmbiguousStatement: "This file matches more than one bank or card — please contact support.",
    errorUnreadableStatement: "Could not read this PDF.",
    errorGeneric: "Something went wrong. Try again.",
    errorUnauthorized: "Sign in to upload a statement.",
  },
  es: {
    title: "Subir",
    pickFile: "Elegir PDF",
    uploading: "Subiendo…",
    statementStaged: "En espera",
    statementFailed: "No se pudo procesar este estado",
    discard: "Descartar",
    discarding: "Descartando…",
    discarded: "Descartado.",
    activeSessionBlocksUpload: "Descarta esta sesión antes de subir otro estado de cuenta.",
    errorUnsupportedFileType: "Solo se admiten archivos PDF.",
    errorUnknownStatement: "No se pudo reconocer el banco o tarjeta de este archivo.",
    errorAmbiguousStatement:
      "Este archivo coincide con más de un banco o tarjeta — contacta a soporte.",
    errorUnreadableStatement: "No se pudo leer este PDF.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorUnauthorized: "Inicia sesión para subir un estado de cuenta.",
  },
} as const;

export type UploadMessageKey = keyof (typeof uploadMessages)["en"];

export function uploadCopy(locale: Locale) {
  return uploadMessages[locale];
}
