/** Statements browse copy — EN/ES (Story 12.1, FR-57). */
import type { Locale } from "@/lib/i18n/locale";

export const statementsMessages = {
  en: {
    title: "Statements",
    noCardGroupLabel: "No card",
    emptyState: "No statements yet.",
    emptyStateCta: "Upload a statement",
    periodSummaryItemCount: "Items",
    periodSummaryDestination: "Destination",
    viewItemsAction: "View items",
    loading: "Loading…",
    errorGeneric: "Something went wrong. Try again.",
    errorUnauthorized: "Sign in to view statements.",
  },
  es: {
    title: "Declaraciones",
    noCardGroupLabel: "Sin tarjeta",
    emptyState: "Aún no hay declaraciones.",
    emptyStateCta: "Cargar una declaración",
    periodSummaryItemCount: "Elementos",
    periodSummaryDestination: "Destino",
    viewItemsAction: "Ver elementos",
    loading: "Cargando…",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorUnauthorized: "Inicia sesión para ver declaraciones.",
  },
} as const;

export type StatementsMessageKey = keyof (typeof statementsMessages)["en"];

export function statementsCopy(locale: Locale) {
  return statementsMessages[locale];
}
