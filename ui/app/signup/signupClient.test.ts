import { describe, expect, it, vi } from "vitest";

import { attemptSignup } from "./signupClient";
import { signupMessages } from "@/lib/i18n/signup";
import { resolveAuthenticatedLanding } from "@/lib/landing";
import { acceptInvite, fetchInvitePreview } from "@/app/invites/inviteClient";
import { inviteMessages } from "@/lib/i18n/invite";

describe("attemptSignup", () => {
  it("returns ok on 201", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "u1",
          email: "member@example.com",
          list_id: "l1",
          list_name: "Personal",
        }),
        { status: 201 },
      ),
    );
    const result = await attemptSignup({
      email: "member@example.com",
      password: "password1",
      errorDuplicate: signupMessages.en.errorDuplicate,
      errorInvalid: signupMessages.en.errorInvalid,
      errorGeneric: signupMessages.en.errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, invitingListId: null });
  });

  it("sends invite_token and returns invitingListId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: "u1",
          email: "invitee@example.com",
          list_id: "personal",
          list_name: "Personal",
          inviting_list_id: "invite-list",
        }),
        { status: 201 },
      ),
    );
    const result = await attemptSignup({
      email: "invitee@example.com",
      password: "password1",
      inviteToken: "raw-token",
      errorDuplicate: signupMessages.en.errorDuplicate,
      errorInvalid: signupMessages.en.errorInvalid,
      errorGeneric: signupMessages.en.errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true, invitingListId: "invite-list" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        body: JSON.stringify({
          email: "invitee@example.com",
          password: "password1",
          invite_token: "raw-token",
        }),
      }),
    );
  });

  it("maps email_not_verified to needsVerify for invite retain flow", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "email_not_verified" }), { status: 403 }),
    );
    const result = await attemptSignup({
      email: "invitee@example.com",
      password: "password1",
      inviteToken: "raw-token",
      errorDuplicate: signupMessages.en.errorDuplicate,
      errorInvalid: signupMessages.en.errorInvalid,
      errorGeneric: signupMessages.en.errorGeneric,
      errorNotVerified: signupMessages.en.errorNotVerified,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      error: signupMessages.en.errorNotVerified,
      code: "email_not_verified",
      needsVerify: true,
    });
  });

  it("maps duplicate_email to i18n duplicate error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "duplicate_email" }), { status: 409 }),
    );
    const result = await attemptSignup({
      email: "member@example.com",
      password: "password1",
      errorDuplicate: signupMessages.en.errorDuplicate,
      errorInvalid: signupMessages.en.errorInvalid,
      errorGeneric: signupMessages.en.errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      error: signupMessages.en.errorDuplicate,
    });
  });

  it("returns generic error when upstream fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await attemptSignup({
      email: "member@example.com",
      password: "password1",
      errorDuplicate: signupMessages.en.errorDuplicate,
      errorInvalid: signupMessages.en.errorInvalid,
      errorGeneric: signupMessages.en.errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      ok: false,
      error: signupMessages.en.errorGeneric,
    });
  });
});

describe("invite landing", () => {
  it("post-invite-signup redirect targets list detail not homepage", () => {
    expect(
      resolveAuthenticatedLanding({ inviteListId: "invite-list" }),
    ).toBe("/lists/invite-list");
    expect(resolveAuthenticatedLanding()).toBe("/home");
  });

  it("maps expired preview to calm error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "invalid_invite_token" }), { status: 410 }),
    );
    const result = await fetchInvitePreview(
      "bad",
      {
        errorExpired: inviteMessages.en.errorExpired,
        errorGeneric: inviteMessages.en.errorGeneric,
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({
      ok: false,
      code: "invalid_invite_token",
      error: inviteMessages.en.errorExpired,
    });
  });

  it("accept returns list id on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ list_id: "list-1" }), { status: 200 }),
    );
    const result = await acceptInvite(
      "tok",
      {
        errorExpired: inviteMessages.en.errorExpired,
        errorMismatch: inviteMessages.en.errorMismatch,
        errorNotVerified: inviteMessages.en.errorNotVerified,
        errorGeneric: inviteMessages.en.errorGeneric,
        errorUnauthorized: inviteMessages.en.errorUnauthorized,
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: true, listId: "list-1" });
  });
});
