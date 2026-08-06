import { describe, expect, it, vi } from "vitest";

import { attemptSignIn, safeReturnTo, signInFailureMessage } from "./signInClient";
import { signInMessages } from "@/lib/i18n/signin";

describe("safeReturnTo", () => {
  it("defaults to / for empty or external targets (home resolves first paint)", () => {
    expect(safeReturnTo(undefined)).toBe("/");
    expect(safeReturnTo("https://evil.example")).toBe("/");
    expect(safeReturnTo("//evil.example")).toBe("/");
    expect(safeReturnTo("/\\evil.example")).toBe("/");
    expect(safeReturnTo("/upload")).toBe("/upload");
    expect(safeReturnTo("/lists")).toBe("/lists");
  });
});

describe("sign-in form failure path", () => {
  it("returns the generic i18n error on failed credentials", async () => {
    const errorGeneric = signInMessages.en.errorGeneric;
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "nope", code: "invalid_credentials" }), {
        status: 401,
      }),
    );

    const result = await attemptSignIn({
      email: "user@example.com",
      password: "wrong-pass",
      returnTo: "/upload",
      errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      error: signInFailureMessage(errorGeneric),
    });
    expect(result.ok === false && result.error).toBe(errorGeneric);
    expect(errorGeneric.toLowerCase()).toContain("invalid");
  });

  it("returns rate_limited detail on 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Too many attempts. Please try again later.",
          code: "rate_limited",
        }),
        { status: 429 },
      ),
    );

    const result = await attemptSignIn({
      email: "user@example.com",
      password: "password1",
      returnTo: "/lists",
      errorGeneric: signInMessages.en.errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({
      ok: false,
      error: "Too many attempts. Please try again later.",
    });
  });

  it("returns safe returnTo on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ user_id: "u1", email: "a@example.com" }), {
        status: 200,
      }),
    );

    const result = await attemptSignIn({
      email: "a@example.com",
      password: "password1",
      returnTo: "/upload",
      errorGeneric: signInMessages.en.errorGeneric,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: true, returnTo: "/upload" });
  });
});
