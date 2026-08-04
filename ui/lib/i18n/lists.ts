/** Lists create/rename copy — EN/ES (Story 2.1). */

export const listsMessages = {
  en: {
    brand: "finance-helper",
    title: "Lists",
    subtitle: "Lists you belong to. Create another list or rename one you own.",
    createLabel: "New list name",
    createSubmit: "Create list",
    creating: "Creating…",
    renameLabel: "Rename",
    renameSubmit: "Save name",
    saving: "Saving…",
    ownedBadge: "Owner",
    memberBadge: "Member",
    emptyHint: "No lists yet.",
    uploadLink: "Upload",
    uploadHint: "(protected stub — statement import lands in Epic 4).",
    errorGeneric: "Something went wrong. Try again.",
    errorInvalidName: "Enter a list name.",
    errorForbidden: "You cannot rename this list.",
    errorUnauthorized: "Sign in again to continue.",
  },
  es: {
    brand: "finance-helper",
    title: "Listas",
    subtitle: "Listas a las que perteneces. Crea otra lista o renombra una que poseas.",
    createLabel: "Nombre de la nueva lista",
    createSubmit: "Crear lista",
    creating: "Creando…",
    renameLabel: "Renombrar",
    renameSubmit: "Guardar nombre",
    saving: "Guardando…",
    ownedBadge: "Propietario",
    memberBadge: "Miembro",
    emptyHint: "Aún no hay listas.",
    uploadLink: "Subir",
    uploadHint: "(stub protegido — la importación llega en el Epic 4).",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorInvalidName: "Escribe un nombre de lista.",
    errorForbidden: "No puedes renombrar esta lista.",
    errorUnauthorized: "Vuelve a iniciar sesión para continuar.",
  },
} as const;

export type ListsMessageKey = keyof (typeof listsMessages)["en"];

export { detectLocale } from "@/lib/i18n/locale";
export type { Locale } from "@/lib/i18n/locale";
