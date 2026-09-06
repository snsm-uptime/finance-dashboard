/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";
import type { ListItem } from "@/app/lists/listsClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

vi.mock("@/app/lists/lists.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

import { AppShell } from "@/components/AppShell";
import { HomeListsSection } from "./HomeListsSection";
import { resetMembershipListsStore } from "@/app/lists/membershipListsStore";

const t = listsMessages.en;

const solo: ListItem = {
  id: "personal",
  name: "Personal",
  owner_id: "owner-1",
  role: "owner",
  balance_crc: "0",
  total_crc: "0",
  members: [{ user_id: "owner-1", alias: "sebas" }],
};

describe("HomeListsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    resetMembershipListsStore();
    vi.unstubAllGlobals();
  });

  it("starts with the toggle OFF: create input visible, non-archived lists shown", () => {
    act(() => {
      root.render(
        <AppShell>
          <HomeListsSection
            title="Lists"
            alias="sebas"
            userId="owner-1"
            photoBase64={null}
            initialLists={[solo]}
            currentUserId="owner-1"
          />
        </AppShell>,
      );
    });

    expect(container.querySelector(`[placeholder="${t.createLabel}"]`)).not.toBeNull();
    expect(container.textContent).toContain("Personal");
    const header = container.querySelector('[data-app-chrome="header"]') as HTMLElement;
    const toggle = header.querySelector('[aria-pressed]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking the chrome's box icon flips ListsPanel into archived mode and fetches archived lists", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ lists: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      root.render(
        <AppShell>
          <HomeListsSection
            title="Lists"
            alias="sebas"
            userId="owner-1"
            photoBase64={null}
            initialLists={[solo]}
            currentUserId="owner-1"
          />
        </AppShell>,
      );
    });

    const header = container.querySelector('[data-app-chrome="header"]') as HTMLElement;
    const toggle = header.querySelector('[aria-pressed]') as HTMLButtonElement;

    await act(async () => {
      toggle.click();
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lists?archived=true",
      expect.objectContaining({ method: "GET" }),
    );
    expect(container.querySelector(`[placeholder="${t.createLabel}"]`)).toBeNull();

    await act(async () => {
      toggle.click();
    });

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(`[placeholder="${t.createLabel}"]`)).not.toBeNull();
    expect(container.textContent).toContain("Personal");
  });
});
