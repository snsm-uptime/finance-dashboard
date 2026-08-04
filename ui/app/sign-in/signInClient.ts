/** Pure helpers for sign-in form (unit-tested without a React render). */

export function safeReturnTo(value: string | undefined): string {
  if (!value) return "/lists";
  if (!value.startsWith("/")) return "/lists";
  if (value.startsWith("//")) return "/lists";
  if (value.includes("\\")) return "/lists";
  if (value.includes("://")) return "/lists";
  return value;
}

/** Failed sign-in always surfaces the generic i18n error string (no status branching). */
export function signInFailureMessage(errorGeneric: string): string {
  return errorGeneric;
}

export type SignInAttemptResult =
  | { ok: true; returnTo: string }
  | { ok: false; error: string };

export async function attemptSignIn(options: {
  email: string;
  password: string;
  returnTo: string | undefined;
  errorGeneric: string;
  fetchImpl?: typeof fetch;
}): Promise<SignInAttemptResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: options.email,
        password: options.password,
      }),
      credentials: "same-origin",
    });
    if (!response.ok) {
      return { ok: false, error: signInFailureMessage(options.errorGeneric) };
    }
    return { ok: true, returnTo: safeReturnTo(options.returnTo) };
  } catch {
    return { ok: false, error: signInFailureMessage(options.errorGeneric) };
  }
}
