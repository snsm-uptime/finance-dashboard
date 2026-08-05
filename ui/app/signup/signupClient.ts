/** Pure helpers for signup form (unit-tested without a React render). */

export type SignupAttemptResult =
  | { ok: true }
  | { ok: false; error: string };

export async function attemptSignup(args: {
  email: string;
  password: string;
  errorDuplicate: string;
  errorInvalid: string;
  errorGeneric: string;
  fetchImpl?: typeof fetch;
}): Promise<SignupAttemptResult> {
  const fetchFn = args.fetchImpl ?? fetch;
  try {
    const response = await fetchFn("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: args.email, password: args.password }),
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as {
      detail?: string;
      code?: string;
    };
    if (!response.ok) {
      if (data.code === "rate_limited" || response.status === 429) {
        return {
          ok: false,
          error: data.detail || "Too many attempts. Please try again later.",
        };
      }
      if (data.code === "duplicate_email") {
        return { ok: false, error: args.errorDuplicate };
      }
      if (data.code === "invalid_signup" || response.status === 400) {
        return { ok: false, error: data.detail || args.errorInvalid };
      }
      return { ok: false, error: args.errorGeneric };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: args.errorGeneric };
  }
}
