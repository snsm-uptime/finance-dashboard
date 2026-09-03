/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchLists = vi.fn();
const fetchCards = vi.fn();
const routerBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: routerBack }),
  usePathname: () => "/account",
}));

vi.mock("@/app/lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/lists/listsClient")>(
    "@/app/lists/listsClient",
  );
  return {
    ...actual,
    fetchLists: (...args: unknown[]) => fetchLists(...args),
  };
});

vi.mock("@/app/cards/cardsClient", async () => {
  const actual = await vi.importActual<typeof import("@/app/cards/cardsClient")>(
    "@/app/cards/cardsClient",
  );
  return {
    ...actual,
    fetchCards: (...args: unknown[]) => fetchCards(...args),
  };
});

import { AccountMenu } from "./AccountMenu";
import { AppShell } from "./AppShell";
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
    fetchLists.mockReset();
    fetchLists.mockResolvedValue({ ok: true, lists: [] });
    fetchCards.mockReset();
    fetchCards.mockResolvedValue({ ok: true, cards: [] });
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
    expect(host.querySelector('[aria-label="Light"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="Dark"]')).toBeTruthy();
    expect(host.querySelector('[aria-label="System"]')).toBeTruthy();
    const resetBtn = findButton(host, "Password reset");
    const signOutBtn = findButton(host, "Sign out");
    expect(resetBtn).toBeTruthy();
    expect(signOutBtn).toBeTruthy();
    expect(
      Boolean(
        resetBtn &&
          signOutBtn &&
          resetBtn.compareDocumentPosition(signOutBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
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
      const btn = host.querySelector('[aria-label="Dark"]') as HTMLButtonElement | null;
      return Boolean(btn && !btn.disabled);
    });
    const darkBtn = host.querySelector('[aria-label="Dark"]') as HTMLButtonElement | null;
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
      const btn = host.querySelector('[aria-label="System"]') as HTMLButtonElement | null;
      return Boolean(btn && !btn.disabled && btn.getAttribute("aria-checked") === "true");
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

  it("shows the default review destination when the user has lists", async () => {
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [{ id: "list-1", name: "Household", owner_id: "u1", role: "owner" }],
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/auth/me") {
        return Promise.resolve(
          new Response(
            JSON.stringify(mePayload({ default_import_list_id: "list-1" })),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { host, unmount } = renderAccount();
    await waitForDom(() => host.textContent?.includes("Default review destination"));
    expect(host.textContent).toContain("Household");
    unmount();
  });

  it("shows a Back button (not the avatar) in the chrome leading slot, and it navigates back", async () => {
    routerBack.mockClear();
    const host = document.createElement("div");
    document.body.appendChild(host);
    let root!: Root;
    act(() => {
      root = createRoot(host);
      root.render(
        <PreferencesProvider>
          <AppShell>
            <AccountMenu />
          </AppShell>
        </PreferencesProvider>,
      );
    });
    await waitForDom(() => host.textContent?.includes("Language"));

    const header = host.querySelector('[data-app-chrome="header"]') as HTMLElement;
    const backButton = header.querySelector('button[aria-label="Back"]') as HTMLButtonElement;
    expect(backButton).toBeTruthy();
    expect(header.querySelector('[role="img"]')).toBeNull(); // no Avatar in the chrome

    act(() => {
      backButton.click();
    });
    expect(routerBack).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    host.remove();
  });
});
