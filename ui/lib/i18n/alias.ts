/** Alias setup chrome — EN/ES. Shared by the post-verify path and the first-visit gate. */

export const aliasMessages = {
  en: {
    title: "Choose your alias",
    subtitle:
      "This is the name your lists show for you. Your email stays private.",
    label: "Alias",
    hint: "3–32 characters: lowercase letters, numbers, and underscores.",
    submit: "Save alias",
    saving: "Saving…",
    errorTaken: "That alias is taken. Try another one.",
    errorInvalid:
      "Use 3–32 characters: lowercase letters, numbers, and underscores.",
    errorAlreadySet: "Your alias is already set.",
    errorUnauthorized: "Sign in again to continue.",
    errorGeneric: "Something went wrong. Try again.",
    photoLabel: "Photo (optional)",
    photoHint: "Shown wherever your alias appears. Skip to use a colored initial instead.",
    photoRemove: "Remove photo",
    errorPhotoInvalid: "That photo couldn't be used. Try a different image.",
  },
  es: {
    title: "Elige tu alias",
    subtitle:
      "Este es el nombre que tus listas muestran por ti. Tu correo se mantiene privado.",
    label: "Alias",
    hint: "3–32 caracteres: minúsculas, números y guiones bajos.",
    submit: "Guardar alias",
    saving: "Guardando…",
    errorTaken: "Ese alias ya está tomado. Prueba con otro.",
    errorInvalid:
      "Usa 3–32 caracteres: minúsculas, números y guiones bajos.",
    errorAlreadySet: "Tu alias ya está definido.",
    errorUnauthorized: "Vuelve a iniciar sesión para continuar.",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    photoLabel: "Foto (opcional)",
    photoHint: "Se muestra donde aparece tu alias. Omite para usar una inicial de color.",
    photoRemove: "Quitar foto",
    errorPhotoInvalid: "No se pudo usar esa foto. Prueba con otra imagen.",
  },
} as const;

export type AliasMessageKey = keyof (typeof aliasMessages)["en"];
/** Widened so EN and ES are interchangeable at call sites. */
export type AliasMessages = Record<AliasMessageKey, string>;

export { detectLocale } from "@/lib/i18n/locale";
export type { Locale } from "@/lib/i18n/locale";
