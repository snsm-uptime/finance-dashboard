/** Signup copy — EN/ES keys (Account prefs = Story 1.6). */
export type Locale = "en" | "es";

export const signupMessages = {
  en: {
    brand: "finance-helper",
    title: "Create account",
    subtitle: "Sign up with email and password to get your personal list.",
    email: "Email",
    password: "Password",
    submit: "Sign up",
    submitting: "Creating account…",
    successRedirect: "Account created. Opening your lists…",
    errorGeneric: "Something went wrong. Try again.",
    errorDuplicate: "An account with this email already exists.",
    errorInvalid: "Check your email and password and try again.",
    passwordHint: "At least 8 characters",
    showPassword: "Show password",
    hidePassword: "Hide password",
  },
  es: {
    brand: "finance-helper",
    title: "Crear cuenta",
    subtitle: "Regístrate con correo y contraseña para obtener tu lista personal.",
    email: "Correo",
    password: "Contraseña",
    submit: "Registrarse",
    submitting: "Creando cuenta…",
    successRedirect: "Cuenta creada. Abriendo tus listas…",
    errorGeneric: "Algo salió mal. Inténtalo de nuevo.",
    errorDuplicate: "Ya existe una cuenta con este correo.",
    errorInvalid: "Revisa tu correo y contraseña e inténtalo de nuevo.",
    passwordHint: "Mínimo 8 caracteres",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
  },
} as const;

export type SignupMessageKey = keyof (typeof signupMessages)["en"];

export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return "en";
  const primary = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "en";
  return primary.startsWith("es") ? "es" : "en";
}
