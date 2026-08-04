/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./AccountMenu";
import { PreferencesProvider } from "./PreferencesProvider";

function renderAccount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root!: Root;
  act(() => {
    root = createRoot(host);
    root.render(
      <PreferencesProvider>
        <AccountMenu />
      </PreferencesProvider>,
    );
  });
  return {
    host,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function waitForDom(predicate: () => boolean | undefined, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  throw new Error("waitForDom timed out");
}

describe("AccountMenu", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            authenticated: true,
            user_id: "u1",
            email: "user@example.com",
            language: "en",
            theme: "system",
            language_stored: null,
            theme_stored: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("shows language, theme, password reset, and sign out", async () => {
    const { host, unmount } = renderAccount();
    await waitForDom(() => host.textContent?.includes("Language"));
    expect(host.textContent).toContain("Language");
    expect(host.textContent).toContain("Theme");
    expect(host.textContent).toContain("Password reset");
    expect(host.textContent).toContain("Sign out");
    expect(host.textContent).toContain("Light");
    expect(host.textContent).toContain("Dark");
    expect(host.textContent).toContain("System");
    expect(host.querySelector('a[href="/forgot-password"]')).not.toBeNull();
    unmount();
  });

  it("PATCHes language and updates document lang", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            user_id: "u1",
            email: "user@example.com",
            language: "en",
            theme: "system",
            language_stored: null,
            theme_stored: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            user_id: "u1",
            email: "user@example.com",
            language: "es",
            theme: "system",
            language_stored: "es",
            theme_stored: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { host, unmount } = renderAccount();
    await waitForDom(() => host.textContent?.includes("Español"));
    const esBtn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "Español",
    );
    expect(esBtn).toBeTruthy();
    await act(async () => {
      esBtn!.click();
    });
    await waitForDom(() => document.documentElement.lang === "es");
    expect(document.documentElement.lang).toBe("es");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ language: "es" }),
      }),
    );
    unmount();
  });
});
