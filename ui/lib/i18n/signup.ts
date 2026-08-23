/** Signup copy — EN/ES keys (Account prefs = Story 1.6). */

export const signupMessages = {
  en: {
    title: "Create account",
    subtitle: "Sign up with email and password to get your personal list.",
    email: "Email",
    password: "Password",
    submit: "Sign up",
    submitting: "Creating account…",
    errorGeneric: "Something went wrong. Try again.",
    errorDuplicate: "An account with this email already exists.",
    errorInvalid: "Check your email and password and try again.",
    errorExpiredInvite:
      "This invite link is invalid or has expired. Ask the list owner for a new invite.",
    errorInviteMismatch: "Use the email address this invite was sent to.",
    errorNotVerified: "Verify your email before joining this list.",
    passwordHint: "At least 8 characters",
    showPassword: "Show password",
    hidePassword: "Hide password",
    loadingInvite: "Loading invite…",
  },
  es: {
    title: "Crear cuenta",
    subtitle: "Regístrate con correo y contraseña para obtener tu lista personal.",
    email: "Correo",
    password: "Contraseña",
    submit: "Registrarse",
    submitting: "Creando cuenta…",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorDuplicate: "Ya existe una cuenta con este correo.",
    errorInvalid: "Revisa tu correo y contraseña e inténtalo de nuevo.",
    errorExpiredInvite:
      "Este enlace de invitación no es válido o ha caducado. Pide uno nuevo al dueño de la lista.",
    errorInviteMismatch: "Usa el correo al que se envió esta invitación.",
    errorNotVerified: "Verifica tu correo antes de unirte a esta lista.",
    passwordHint: "Mínimo 8 caracteres",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    loadingInvite: "Cargando invitación…",
  },
} as const;

export type SignupMessageKey = keyof (typeof signupMessages)["en"];

export { detectLocale } from "@/lib/i18n/locale";
export type { Locale } from "@/lib/i18n/locale";
