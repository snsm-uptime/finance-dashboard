/** Pure helpers for signup form (unit-tested without a React render). */

export type SignupAttemptResult =
  | { ok: true; invitingListId?: string | null }
  | {
      ok: false;
      error: string;
      code?: string;
      needsVerify?: boolean;
    };

export async function attemptSignup(args: {
  email: string;
  password: string;
  inviteToken?: string | null;
  errorDuplicate: string;
  errorInvalid: string;
  errorGeneric: string;
  errorExpiredInvite?: string;
  errorInviteMismatch?: string;
  errorNotVerified?: string;
  fetchImpl?: typeof fetch;
}): Promise<SignupAttemptResult> {
  const fetchFn = args.fetchImpl ?? fetch;
  const body: Record<string, string> = {
    email: args.email,
    password: args.password,
  };
  if (args.inviteToken) {
    body.invite_token = args.inviteToken;
  }
  try {
    const response = await fetchFn("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as {
      detail?: string;
      code?: string;
      inviting_list_id?: string | null;
    };
    if (!response.ok) {
      if (data.code === "email_not_verified" || response.status === 403) {
        if (data.code === "email_not_verified") {
          return {
            ok: false,
            error: args.errorNotVerified || args.errorGeneric,
            code: "email_not_verified",
            needsVerify: true,
          };
        }
        if (data.code === "invite_email_mismatch") {
          return {
            ok: false,
            error: args.errorInviteMismatch || args.errorGeneric,
            code: "invite_email_mismatch",
          };
        }
      }
      if (data.code === "invalid_invite_token" || response.status === 410) {
        return {
          ok: false,
          error: args.errorExpiredInvite || args.errorGeneric,
          code: "invalid_invite_token",
        };
      }
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
    return {
      ok: true,
      invitingListId:
        typeof data.inviting_list_id === "string" ? data.inviting_list_id : null,
    };
  } catch {
    return { ok: false, error: args.errorGeneric };
  }
}
