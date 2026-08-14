/** Account menu chrome — EN/ES (UX-DR10). */
import type { Locale } from "@/lib/i18n/locale";

export const accountMessages = {
  en: {
    brand: "finance-helper",
    title: "Account",
    subtitle: "Language, appearance, and sign out — no profile settings.",
    language: "Language",
    theme: "Theme",
    en: "English",
    es: "Español",
    light: "Light",
    dark: "Dark",
    system: "System",
    signOut: "Sign out",
    signingOut: "Signing out…",
    passwordReset: "Password reset",
    saving: "Saving…",
    loading: "Loading…",
    saveLanguageFailed: "Could not save language. Try again.",
    saveThemeFailed: "Could not save theme. Try again.",
    backToLists: "Back to lists",
    navAccount: "Account",
    manageCards: "Manage cards",
  },
  es: {
    brand: "finance-helper",
    title: "Cuenta",
    subtitle: "Idioma, apariencia y cerrar sesión — sin ajustes de perfil.",
    language: "Idioma",
    theme: "Tema",
    en: "English",
    es: "Español",
    light: "Claro",
    dark: "Oscuro",
    system: "Sistema",
    signOut: "Cerrar sesión",
    signingOut: "Cerrando sesión…",
    passwordReset: "Restablecer contraseña",
    saving: "Guardando…",
    loading: "Cargando…",
    saveLanguageFailed: "No se pudo guardar el idioma. Inténtalo de nuevo.",
    saveThemeFailed: "No se pudo guardar el tema. Inténtalo de nuevo.",
    backToLists: "Volver a listas",
    navAccount: "Cuenta",
    manageCards: "Administrar tarjetas",
  },
} as const;

export type AccountMessageKey = keyof (typeof accountMessages)["en"];

export function accountCopy(locale: Locale) {
  return accountMessages[locale];
}
