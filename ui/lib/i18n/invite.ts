/** Invitee accept / signup chrome — EN/ES (Story 2.4). */

export const inviteMessages = {
  en: {
    brand: "finance-helper",
    acceptTitle: "Join list",
    acceptSubtitle: "Accept this invitation to open the shared list.",
    accepting: "Joining the list…",
    acceptSuccess: "Joined. Opening the list…",
    signInPrompt: "Sign in with the email this invite was sent to, then you’ll join the list.",
    signInCta: "Sign in to join",
    verifyCta: "Verify email to continue",
    errorExpired:
      "This invite link is invalid or has expired. Ask the list owner for a new invite.",
    errorMismatch: "Use the email address this invite was sent to.",
    errorNotVerified: "Verify your email before joining this list.",
    errorUnauthorized: "Sign in to accept this invite.",
    errorGeneric: "Something went wrong. Try again.",
    inviteSignupSubtitle: "Create your account to join “{listName}”.",
    emailLockedHint: "Invite sent to {emailHint}",
  },
  es: {
    brand: "finance-helper",
    acceptTitle: "Unirse a la lista",
    acceptSubtitle: "Acepta esta invitación para abrir la lista compartida.",
    accepting: "Uniéndote a la lista…",
    acceptSuccess: "Listo. Abriendo la lista…",
    signInPrompt:
      "Inicia sesión con el correo de esta invitación y te unirás a la lista.",
    signInCta: "Iniciar sesión para unirme",
    verifyCta: "Verificar correo para continuar",
    errorExpired:
      "Este enlace de invitación no es válido o ha caducado. Pide uno nuevo al dueño de la lista.",
    errorMismatch: "Usa el correo al que se envió esta invitación.",
    errorNotVerified: "Verifica tu correo antes de unirte a esta lista.",
    errorUnauthorized: "Inicia sesión para aceptar esta invitación.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    inviteSignupSubtitle: "Crea tu cuenta para unirte a «{listName}».",
    emailLockedHint: "Invitación enviada a {emailHint}",
  },
} as const;

export type InviteMessageKey = keyof (typeof inviteMessages)["en"];
export type { Locale } from "@/lib/i18n/locale";
