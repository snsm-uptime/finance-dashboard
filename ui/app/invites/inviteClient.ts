/** Invite accept / preview client helpers (Story 2.4). */

export type InvitePreview = {
  list_name: string;
  email: string;
  email_hint: string;
  path: "signup" | "join";
};

export type InvitePreviewResult =
  | { ok: true; preview: InvitePreview }
  | { ok: false; code: string; error: string };

export type AcceptInviteResult =
  | { ok: true; listId: string }
  | { ok: false; code: string; error: string };

export async function fetchInvitePreview(
  token: string,
  messages: { errorExpired: string; errorGeneric: string },
  fetchImpl: typeof fetch = fetch,
): Promise<InvitePreviewResult> {
  try {
    const response = await fetchImpl(
      `/api/invites/preview?token=${encodeURIComponent(token)}`,
      { method: "GET", headers: { Accept: "application/json" }, credentials: "same-origin" },
    );
    const data = (await response.json().catch(() => ({}))) as {
      list_name?: string;
      email?: string;
      email_hint?: string;
      path?: string;
      detail?: string;
      code?: string;
    };
    if (!response.ok) {
      if (response.status === 410 || data.code === "invalid_invite_token") {
        return { ok: false, code: "invalid_invite_token", error: messages.errorExpired };
      }
      return { ok: false, code: data.code || "error", error: messages.errorGeneric };
    }
    if (
      typeof data.list_name !== "string" ||
      typeof data.email !== "string" ||
      typeof data.email_hint !== "string" ||
      (data.path !== "signup" && data.path !== "join")
    ) {
      return { ok: false, code: "error", error: messages.errorGeneric };
    }
    return {
      ok: true,
      preview: {
        list_name: data.list_name,
        email: data.email,
        email_hint: data.email_hint,
        path: data.path,
      },
    };
  } catch {
    return { ok: false, code: "error", error: messages.errorGeneric };
  }
}

export async function acceptInvite(
  token: string,
  messages: {
    errorExpired: string;
    errorMismatch: string;
    errorNotVerified: string;
    errorGeneric: string;
    errorUnauthorized: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<AcceptInviteResult> {
  try {
    const response = await fetchImpl("/api/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as {
      list_id?: string;
      detail?: string;
      code?: string;
    };
    if (response.status === 401) {
      return {
        ok: false,
        code: "unauthorized",
        error: messages.errorUnauthorized,
      };
    }
    if (!response.ok) {
      if (data.code === "invalid_invite_token" || response.status === 410) {
        return { ok: false, code: "invalid_invite_token", error: messages.errorExpired };
      }
      if (data.code === "invite_email_mismatch") {
        return { ok: false, code: "invite_email_mismatch", error: messages.errorMismatch };
      }
      if (data.code === "email_not_verified") {
        return { ok: false, code: "email_not_verified", error: messages.errorNotVerified };
      }
      return { ok: false, code: data.code || "error", error: messages.errorGeneric };
    }
    if (typeof data.list_id !== "string" || !data.list_id) {
      return { ok: false, code: "error", error: messages.errorGeneric };
    }
    return { ok: true, listId: data.list_id };
  } catch {
    return { ok: false, code: "error", error: messages.errorGeneric };
  }
}
