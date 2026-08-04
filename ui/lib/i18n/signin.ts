/** Sign-in copy — EN/ES keys (Account prefs = Story 1.6). */
export type { Locale } from "@/lib/i18n/locale";
export { detectLocale } from "@/lib/i18n/locale";

export const signInMessages = {
  en: {
    brand: "finance-helper",
    title: "Sign in",
    subtitle: "Use your email and password to access your lists.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    errorGeneric: "Invalid email or password. Check your details and try again.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    noAccount: "Need an account?",
    signUpLink: "Sign up",
    forgotPassword: "Forgot password?",
  },
  es: {
    brand: "finance-helper",
    title: "Iniciar sesión",
    subtitle: "Usa tu correo y contraseña para acceder a tus listas.",
    email: "Correo",
    password: "Contraseña",
    submit: "Iniciar sesión",
    submitting: "Iniciando sesión…",
    errorGeneric:
      "Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    noAccount: "¿Necesitas una cuenta?",
    signUpLink: "Registrarse",
    forgotPassword: "¿Olvidaste tu contraseña?",
  },
} as const;

export type SignInMessageKey = keyof (typeof signInMessages)["en"];
