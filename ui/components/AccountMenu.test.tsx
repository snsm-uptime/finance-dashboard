/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./AccountMenu";
import { PreferencesProvider } from "./PreferencesProvider";

function mePayload(overrides: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    user_id: "u1",
    email: "user@example.com",
    language: null,
    theme: null,
    ...overrides,
  };
}

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

function findButton(host: HTMLElement, label: string) {
  return Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  );
}

describe("AccountMenu", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.lang = "en";
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mePayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    document.body.innerHTML = "";
    document.documentElement.classList.remove("light", "dark");
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
    expect(findButton(host, "Password reset")).toBeTruthy();
    unmount();
  });

  it("PATCHes language and updates document lang", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mePayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(mePayload({ language: "es", theme: null })),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { host, unmount } = renderAccount();
    await waitForDom(() => {
      const btn = findButton(host, "Español");
      return Boolean(btn && !btn.disabled);
    });
    const esBtn = findButton(host, "Español");
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

  it("PATCHes theme and swaps html dark class", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mePayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(mePayload({ language: null, theme: "dark" })),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { host, unmount } = renderAccount();
    await waitForDom(() => {
      const btn = findButton(host, "Dark");
      return Boolean(btn && !btn.disabled);
    });
    const darkBtn = findButton(host, "Dark");
    expect(darkBtn).toBeTruthy();
    await act(async () => {
      darkBtn!.click();
    });
    await waitForDom(() => document.documentElement.classList.contains("dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ theme: "dark" }),
      }),
    );
    unmount();
  });

  it("System theme follows prefers-color-scheme changes", async () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mq = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        listeners.add(listener);
      },
      removeEventListener: (
        _type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        listeners.delete(listener);
      },
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => mq),
    );

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mePayload({ theme: "system" })), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { host, unmount } = renderAccount();
    await waitForDom(() => {
      const btn = findButton(host, "System");
      return Boolean(btn && !btn.disabled && btn.getAttribute("aria-pressed") === "true");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await act(async () => {
      mq.matches = true;
      for (const listener of listeners) {
        listener({ matches: true } as MediaQueryListEvent);
      }
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    unmount();
  });

  it("password reset signs out then navigates to forgot-password", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(mePayload()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const { host, unmount } = renderAccount();
    await waitForDom(() => {
      const btn = findButton(host, "Password reset");
      return Boolean(btn && !btn.disabled);
    });
    localStorage.setItem("fh_lang_cache", "es");
    localStorage.setItem("fh_theme_cache", "dark");

    const resetBtn = findButton(host, "Password reset");
    expect(resetBtn).toBeTruthy();
    await act(async () => {
      resetBtn!.click();
    });
    await waitForDom(() => assign.mock.calls.length > 0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-out",
      expect.objectContaining({ method: "POST" }),
    );
    expect(assign).toHaveBeenCalledWith("/forgot-password");
    expect(localStorage.getItem("fh_lang_cache")).toBeNull();
    expect(localStorage.getItem("fh_theme_cache")).toBeNull();
    unmount();
  });
});
