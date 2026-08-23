/** Email verification copy — EN/ES keys (Account prefs = Story 1.6). */
export type Locale = "en" | "es";

export const verifyMessages = {
  en: {
    title: "Verify your email",
    subtitle:
      "Open the link from your email, or resend a verification message while signed in.",
    confirmSuccess: "Email verified. You can continue with gated actions.",
    confirmErrorToken:
      "This verification link is invalid or has expired. Request a new one.",
    confirmErrorGeneric:
      "Something went wrong. Request a new verification link and try again.",
    confirmMissingToken:
      "This page needs a valid verification link from your email.",
    confirmSubmitting: "Verifying…",
    confirmSubmit: "Verify email",
    resend: "Resend verification email",
    resending: "Sending…",
    resendSuccess: "Check your inbox for a verification link.",
    resendAlready: "Email is already verified.",
    resendNotRequired: "Email verification is not required for this deployment.",
    resendSmtp:
      "We could not send email right now. Try again later, or ask the operator to check SMTP settings.",
    resendUnauthorized: "Sign in to resend a verification email.",
    resendGeneric: "Something went wrong. Try again.",
    signInLink: "Sign in",
    listsLink: "Go to lists",
  },
  es: {
    title: "Verifica tu correo",
    subtitle:
      "Abre el enlace de tu correo, o reenvía un mensaje de verificación si ya iniciaste sesión.",
    confirmSuccess: "Correo verificado. Puedes continuar con las acciones restringidas.",
    confirmErrorToken:
      "Este enlace de verificación no es válido o expiró. Solicita uno nuevo.",
    confirmErrorGeneric:
      "Algo salió mal. Solicita un nuevo enlace de verificación e inténtalo de nuevo.",
    confirmMissingToken:
      "Esta página necesita un enlace de verificación válido de tu correo.",
    confirmSubmitting: "Verificando…",
    confirmSubmit: "Verificar correo",
    resend: "Reenviar correo de verificación",
    resending: "Enviando…",
    resendSuccess: "Revisa tu bandeja de entrada para el enlace de verificación.",
    resendAlready: "El correo ya está verificado.",
    resendNotRequired:
      "La verificación de correo no es requerida en este despliegue.",
    resendSmtp:
      "No pudimos enviar el correo ahora. Inténtalo más tarde o pide al operador revisar SMTP.",
    resendUnauthorized: "Inicia sesión para reenviar el correo de verificación.",
    resendGeneric: "Algo salió mal. Inténtalo de nuevo.",
    signInLink: "Iniciar sesión",
    listsLink: "Ir a listas",
  },
} as const;
