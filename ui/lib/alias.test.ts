import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "fh_session", value: "token" }],
  }),
}));

class RedirectSignal extends Error {
  constructor(public readonly location: string) {
    super(`redirect:${location}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

import { aliasSetupHref, fetchMe, requireAlias } from "@/lib/alias";

function mockMe(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("aliasSetupHref", () => {
  it("carries the destination through setup", () => {
    expect(aliasSetupHref("/lists/list-1")).toBe("/alias?returnTo=%2Flists%2Flist-1");
  });
});

describe("alias gate", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the account alias from the api", async () => {
    mockMe(200, { user_id: "u1", email: "alice@example.com", alias: "alice" });
    await expect(fetchMe()).resolves.toEqual({
      user_id: "u1",
      email: "alice@example.com",
      alias: "alice",
      photo_base64: null,
    });
  });

  it("treats a missing alias as null", async () => {
    mockMe(200, { user_id: "u1", email: "alice@example.com", alias: null });
    await expect(fetchMe()).resolves.toMatchObject({ alias: null });
  });

  it("sends an authenticated account without an alias to setup", async () => {
    mockMe(200, { user_id: "u1", email: "alice@example.com", alias: null });
    const location = await captureRedirect(() => requireAlias("/lists"));
    expect(location).toBe("/alias?returnTo=%2Flists");
  });

  it("lets an account with an alias through", async () => {
    mockMe(200, { user_id: "u1", email: "alice@example.com", alias: "alice" });
    await expect(requireAlias("/lists")).resolves.toMatchObject({ alias: "alice" });
  });

  it("sends an unauthenticated visitor to sign-in", async () => {
    mockMe(401, { code: "unauthenticated" });
    const location = await captureRedirect(() => requireAlias("/lists/list-1"));
    expect(location).toBe("/sign-in?returnTo=%2Flists%2Flist-1");
  });
});
