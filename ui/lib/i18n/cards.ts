/** Cards management copy — EN/ES (Story 4.1, FR-37 / AD-20). */
import type { Locale } from "@/lib/i18n/locale";

export const cardsMessages = {
  en: {
    title: "Cards",
    subtitle: "Register your bank cards by IBAN so imports recognize them by your own labels.",
    labelField: "Label",
    ibanField: "IBAN",
    submit: "Register card",
    submitting: "Registering…",
    emptyState: "No cards registered yet.",
    listTitle: "Your cards",
    loading: "Loading…",
    errorGeneric: "Something went wrong. Try again.",
    errorUnauthorized: "Sign in to manage cards.",
    errorInvalidLabel: "Enter a card label.",
    errorInvalidIban: "Enter a valid IBAN.",
    errorDuplicateIban: "You already have a card registered with this IBAN.",
    backToAccount: "Back to account",
  },
  es: {
    title: "Tarjetas",
    subtitle: "Registra tus tarjetas por IBAN para que las importaciones las reconozcan con tus propias etiquetas.",
    labelField: "Etiqueta",
    ibanField: "IBAN",
    submit: "Registrar tarjeta",
    submitting: "Registrando…",
    emptyState: "Aún no hay tarjetas registradas.",
    listTitle: "Tus tarjetas",
    loading: "Cargando…",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorUnauthorized: "Inicia sesión para administrar tarjetas.",
    errorInvalidLabel: "Ingresa una etiqueta para la tarjeta.",
    errorInvalidIban: "Ingresa un IBAN válido.",
    errorDuplicateIban: "Ya tienes una tarjeta registrada con este IBAN.",
    backToAccount: "Volver a la cuenta",
  },
} as const;

export type CardsMessageKey = keyof (typeof cardsMessages)["en"];

export function cardsCopy(locale: Locale) {
  return cardsMessages[locale];
}
