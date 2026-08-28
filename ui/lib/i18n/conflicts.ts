/** Same-price conflict review copy — EN/ES (Story 5.5, FR-22/UX-DR14/UX-DR22). */
import type { Locale } from "@/lib/i18n/locale";

export const conflictsMessages = {
  en: {
    title: "Same price, two entries",
    subtitle: "Which of these is the real expense?",
    progress: "{count} left to resolve",
    manualLabel: "Manual",
    parsedLabel: "Imported",
    onList: "on {list}",
    pickManual: "Keep the manual entry",
    pickParsed: "Keep the imported entry",
    notSameExpense: "Not the same expense",
    confirmTitle: "Keep both entries?",
    confirmBody:
      "If these are genuinely two separate purchases, keeping both is correct. If they're the same expense entered twice, this will double-count it.",
    confirmAction: "Keep both",
    confirmCancel: "Back",
    resolving: "Resolving…",
    doneReturnToList: "Continue",
    loadError: "Could not load conflicts. Try again.",
    errorUnauthorized: "You need to sign in again.",
    errorForbidden: "You do not have access to one of these lists.",
    errorNotFound: "This conflict is no longer pending.",
    errorAlreadyResolved: "This conflict was already resolved.",
    errorConfirmRequired: "Confirm to keep both entries.",
    errorGeneric: "Something went wrong. Try again.",
  },
  es: {
    title: "Mismo precio, dos registros",
    subtitle: "¿Cuál de estos es el gasto real?",
    progress: "{count} por resolver",
    manualLabel: "Manual",
    parsedLabel: "Importado",
    onList: "en {list}",
    pickManual: "Mantener el registro manual",
    pickParsed: "Mantener el registro importado",
    notSameExpense: "No es el mismo gasto",
    confirmTitle: "¿Mantener ambos registros?",
    confirmBody:
      "Si en verdad son dos compras distintas, mantener ambos es correcto. Si es el mismo gasto ingresado dos veces, esto lo contará doble.",
    confirmAction: "Mantener ambos",
    confirmCancel: "Volver",
    resolving: "Resolviendo…",
    doneReturnToList: "Continuar",
    loadError: "No se pudieron cargar los conflictos. Inténtalo de nuevo.",
    errorUnauthorized: "Necesitas iniciar sesión de nuevo.",
    errorForbidden: "No tienes acceso a una de estas listas.",
    errorNotFound: "Este conflicto ya no está pendiente.",
    errorAlreadyResolved: "Este conflicto ya fue resuelto.",
    errorConfirmRequired: "Confirma para mantener ambos registros.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
  },
} as const;

export type ConflictsMessageKey = keyof (typeof conflictsMessages)["en"];

export function conflictsCopy(locale: Locale) {
  return conflictsMessages[locale];
}
