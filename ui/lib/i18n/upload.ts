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
    assignToList: "Assign to a list",
    errorUnsupportedFileType: "Only PDF files are supported.",
    errorUnknownStatement: "Could not recognize the bank or card for this file.",
    errorAmbiguousStatement: "This file matches more than one bank or card — please contact support.",
    errorUnreadableStatement: "Could not read this PDF.",
    errorGeneric: "Something went wrong. Try again.",
    errorUnauthorized: "Sign in to upload a statement.",
    // Bulk review (Story 4.7)
    bulkReviewTitle: "Assign to a list",
    bulkReviewChooseList: "Choose list",
    bulkReviewConfirm: "Commit to this list",
    bulkReviewCommitting: "Committing…",
    bulkReviewLoadingLists: "Loading your lists…",
    bulkReviewNoLists: "You don't belong to any list yet.",
    bulkReviewErrorForbidden: "You don't have access to that list.",
    bulkReviewErrorSessionNotFound: "This import session could not be found.",
    bulkReviewErrorSessionDiscarded: "This import session has been discarded.",
    bulkReviewErrorAlreadyCommitted: "This import session has already been committed.",
    bulkReviewErrorNoCleanStatements: "There are no clean statements to commit.",
    bulkReviewErrorFxUnavailable: "Currency conversion is unavailable right now. Try again later.",
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
    assignToList: "Asignar a una lista",
    errorUnsupportedFileType: "Solo se admiten archivos PDF.",
    errorUnknownStatement: "No se pudo reconocer el banco o tarjeta de este archivo.",
    errorAmbiguousStatement:
      "Este archivo coincide con más de un banco o tarjeta — contacta a soporte.",
    errorUnreadableStatement: "No se pudo leer este PDF.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorUnauthorized: "Inicia sesión para subir un estado de cuenta.",
    // Bulk review (Story 4.7)
    bulkReviewTitle: "Asignar a una lista",
    bulkReviewChooseList: "Elegir lista",
    bulkReviewConfirm: "Confirmar en esta lista",
    bulkReviewCommitting: "Confirmando…",
    bulkReviewLoadingLists: "Cargando tus listas…",
    bulkReviewNoLists: "Todavía no perteneces a ninguna lista.",
    bulkReviewErrorForbidden: "No tienes acceso a esa lista.",
    bulkReviewErrorSessionNotFound: "No se encontró esta sesión de importación.",
    bulkReviewErrorSessionDiscarded: "Esta sesión de importación fue descartada.",
    bulkReviewErrorAlreadyCommitted: "Esta sesión de importación ya fue confirmada.",
    bulkReviewErrorNoCleanStatements: "No hay estados de cuenta limpios para confirmar.",
    bulkReviewErrorFxUnavailable:
      "La conversión de moneda no está disponible ahora. Inténtalo más tarde.",
  },
} as const;

export type UploadMessageKey = keyof (typeof uploadMessages)["en"];

export function uploadCopy(locale: Locale) {
  return uploadMessages[locale];
}
