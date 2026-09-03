import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchSession = vi.fn();
const resolveServerAuthenticatedLanding = vi.fn();
const requireAlias = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/session", () => ({
  fetchSession: (...args: unknown[]) => fetchSession(...args),
}));
vi.mock("@/lib/serverLanding", () => ({
  resolveServerAuthenticatedLanding: (...args: unknown[]) => resolveServerAuthenticatedLanding(...args),
}));
vi.mock("@/lib/alias", () => ({
  requireAlias: (...args: unknown[]) => requireAlias(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => redirect(...args),
}));
vi.mock("@/components/RedirectIfAuthenticated", () => ({
  RedirectIfAuthenticated: () => null,
}));

describe("Home page", () => {
  beforeEach(() => {
    fetchSession.mockReset();
    resolveServerAuthenticatedLanding.mockReset();
    requireAlias.mockReset();
    redirect.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("shows product intro copy and sign-up/sign-in CTAs when signed out", async () => {
    fetchSession.mockResolvedValue(null);
    const { default: Home } = await import("./page");

    const markup = renderToStaticMarkup(await Home());

    expect(markup).not.toContain("Stack is up");
    expect(markup).not.toContain("Compose services");
    expect(markup).toMatch(/expenses/i);
    expect(markup).toMatch(/budgets/i);
    expect(markup).toMatch(/import/i);
    expect(markup).toContain('href="/signup"');
    expect(markup).toContain('href="/sign-in"');
    expect(markup).toContain('href="/docs"');
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to the resolved landing destination when signed in", async () => {
    fetchSession.mockResolvedValue({ userId: "u1" });
    resolveServerAuthenticatedLanding.mockResolvedValue("/lists/123");
    requireAlias.mockResolvedValue(undefined);
    const { default: Home } = await import("./page");

    await Home();

    expect(resolveServerAuthenticatedLanding).toHaveBeenCalled();
    expect(requireAlias).toHaveBeenCalledWith("/lists/123");
    expect(redirect).toHaveBeenCalledWith("/lists/123");
  });
});
