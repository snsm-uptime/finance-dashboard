import { describe, expect, it, vi } from "vitest";

import { attemptSignup } from "./signupClient";
import { signupMessages } from "@/lib/i18n/signup";

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
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "member@example.com",
          password: "password1",
        }),
      }),
    );
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
