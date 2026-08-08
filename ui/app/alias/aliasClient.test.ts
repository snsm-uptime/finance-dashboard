import { describe, expect, it, vi } from "vitest";

import { aliasMessages } from "@/lib/i18n/alias";

import { aliasErrorMessage, normalizeAliasInput, setAlias } from "./aliasClient";

const messages = aliasMessages.en;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeAliasInput", () => {
  it("trims and lowercases before the server sees it", () => {
    expect(normalizeAliasInput("  Alice  ")).toBe("alice");
    expect(normalizeAliasInput("BOB_99")).toBe("bob_99");
  });
});

describe("aliasErrorMessage", () => {
  it("maps alias_taken to the conflict copy", () => {
    expect(aliasErrorMessage(409, "alias_taken", messages)).toBe(messages.errorTaken);
  });

  it("maps alias_already_set to the set-once copy", () => {
    expect(aliasErrorMessage(409, "alias_already_set", messages)).toBe(
      messages.errorAlreadySet,
    );
  });

  it("maps invalid_alias to the format copy", () => {
    expect(aliasErrorMessage(422, "invalid_alias", messages)).toBe(messages.errorInvalid);
  });

  it("maps 401 to the re-auth copy and anything else to generic", () => {
    expect(aliasErrorMessage(401, "unauthenticated", messages)).toBe(
      messages.errorUnauthorized,
    );
    expect(aliasErrorMessage(500, "", messages)).toBe(messages.errorGeneric);
  });

  it("does not treat unlabeled 409/422 as alias-specific copy", () => {
    expect(aliasErrorMessage(409, "not_list_member", messages)).toBe(messages.errorGeneric);
    expect(aliasErrorMessage(422, "", messages)).toBe(messages.errorGeneric);
  });
});

describe("setAlias", () => {
  it("PATCHes the normalized alias to the BFF and returns the stored value", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { alias: "alice" }));

    const result = await setAlias("  Alice ", messages, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: true, alias: "alice" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/auth/me");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ alias: "alice" });
  });

  it("surfaces alias_taken on a case-insensitive conflict", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(409, { code: "alias_taken", detail: "taken" }));

    const result = await setAlias("ALICE", messages, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: false, error: messages.errorTaken });
  });

  it("surfaces invalid_alias on a format rejection", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(422, { code: "invalid_alias" }));

    const result = await setAlias("ab", messages, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: false, error: messages.errorInvalid });
  });

  it("falls back to generic copy when the network throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

    const result = await setAlias("alice", messages, fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({ ok: false, error: messages.errorGeneric });
  });
});
