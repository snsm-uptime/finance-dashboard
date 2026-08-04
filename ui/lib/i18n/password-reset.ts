/** Password-reset copy — EN/ES keys (Account prefs = Story 1.6). */
export type Locale = "en" | "es";

export const passwordResetMessages = {
  en: {
    brand: "finance-helper",
    forgotTitle: "Forgot password",
    forgotSubtitle:
      "Enter your email and we will send a reset link if that account exists.",
    email: "Email",
    forgotSubmit: "Send reset link",
    forgotSubmitting: "Sending…",
    forgotSuccess:
      "If that email is registered, you will receive a reset link shortly. Check your inbox.",
    forgotErrorSmtp:
      "We could not send email right now. Try again later, or ask the operator to check SMTP settings.",
    forgotErrorGeneric: "Something went wrong. Check your email and try again.",
    backToSignIn: "Back to sign in",
    resetTitle: "Choose a new password",
    resetSubtitle: "Enter a new password for your account.",
    newPassword: "New password",
    resetSubmit: "Update password",
    resetSubmitting: "Updating…",
    resetSuccess: "Password updated. You can sign in with your new password.",
    resetErrorToken:
      "This reset link is invalid or has expired. Request a new one.",
    resetErrorPassword: "Password must be at least 8 characters.",
    resetErrorGeneric: "Something went wrong. Request a new reset link and try again.",
    resetMissingToken: "This page needs a valid reset link from your email.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    signInLink: "Sign in",
  },
  es: {
    brand: "finance-helper",
    forgotTitle: "Olvidé mi contraseña",
    forgotSubtitle:
      "Ingresa tu correo y te enviaremos un enlace de restablecimiento si la cuenta existe.",
    email: "Correo",
    forgotSubmit: "Enviar enlace",
    forgotSubmitting: "Enviando…",
    forgotSuccess:
      "Si ese correo está registrado, recibirás un enlace en breve. Revisa tu bandeja.",
    forgotErrorSmtp:
      "No pudimos enviar el correo ahora. Intenta más tarde o pide al operador revisar SMTP.",
    forgotErrorGeneric: "Algo salió mal. Revisa tu correo e inténtalo de nuevo.",
    backToSignIn: "Volver a iniciar sesión",
    resetTitle: "Elige una nueva contraseña",
    resetSubtitle: "Ingresa una nueva contraseña para tu cuenta.",
    newPassword: "Nueva contraseña",
    resetSubmit: "Actualizar contraseña",
    resetSubmitting: "Actualizando…",
    resetSuccess: "Contraseña actualizada. Ya puedes iniciar sesión con la nueva.",
    resetErrorToken:
      "Este enlace no es válido o expiró. Solicita uno nuevo.",
    resetErrorPassword: "La contraseña debe tener al menos 8 caracteres.",
    resetErrorGeneric:
      "Algo salió mal. Solicita un nuevo enlace e inténtalo de nuevo.",
    resetMissingToken: "Esta página necesita un enlace válido de tu correo.",
    showPassword: "Mostrar contraseña",
    hidePassword: "Ocultar contraseña",
    signInLink: "Iniciar sesión",
  },
} as const;

export type PasswordResetMessageKey = keyof (typeof passwordResetMessages)["en"];
