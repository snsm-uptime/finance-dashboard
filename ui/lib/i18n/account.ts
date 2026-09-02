/** Account menu chrome — EN/ES (UX-DR10). */
import type { Locale } from "@/lib/i18n/locale";

export const accountMessages = {
  en: {
    title: "Account",
    subtitle: "Language, appearance, photo, default review list, and sign out.",
    photo: "Photo",
    photoUpload: "Upload photo",
    photoRemove: "Remove photo",
    photoError: "That photo couldn't be used. Try a different image.",
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
    loading: "Loading…",
    saveLanguageFailed: "Could not save language. Try again.",
    saveThemeFailed: "Could not save theme. Try again.",
    navAccount: "Account",
    manageCards: "Manage cards",
    defaultListTitle: "Default review destination",
    errorGeneric: "Something went wrong. Try again.",
    errorUnauthorized: "Sign in to manage your account.",
    errorForbidden: "You don't have access to that list.",
  },
  es: {
    title: "Cuenta",
    subtitle: "Idioma, apariencia, foto, lista de revisión por defecto y cerrar sesión.",
    photo: "Foto",
    photoUpload: "Subir foto",
    photoRemove: "Quitar foto",
    photoError: "No se pudo usar esa foto. Prueba con otra imagen.",
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
    loading: "Cargando…",
    saveLanguageFailed: "No se pudo guardar el idioma. Inténtalo de nuevo.",
    saveThemeFailed: "No se pudo guardar el tema. Inténtalo de nuevo.",
    navAccount: "Cuenta",
    manageCards: "Administrar tarjetas",
    defaultListTitle: "Destino de revisión por defecto",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorUnauthorized: "Inicia sesión para administrar tu cuenta.",
    errorForbidden: "No tienes acceso a esa lista.",
  },
} as const;

export type AccountMessageKey = keyof (typeof accountMessages)["en"];

export function accountCopy(locale: Locale) {
  return accountMessages[locale];
}
