/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";
import type { ListItem } from "./listsClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
}));

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

vi.mock("./lists.module.scss", () => ({
  default: new Proxy(
    {},
    {
      get: (_t, prop) => String(prop),
    },
  ),
}));

import { AppShell } from "@/components/AppShell";
import { ListsPanel } from "./ListsPanel";
import { resetMembershipListsStore } from "./membershipListsStore";

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

const shared: ListItem = {
  id: "home",
  name: "Home",
  owner_id: "owner-1",
  role: "owner",
  balance_crc: "0",
  members: [
    { user_id: "owner-1", alias: "sebas" },
    { user_id: "member-2", alias: "alex" },
    { user_id: "member-3", alias: null },
  ],
};

function chipTexts(card: Element | null): string[] {
  return Array.from(card?.querySelectorAll(".chipRow span") ?? []).map(
    (el) => el.textContent ?? "",
  );
}

describe("ListsPanel roster chips", () => {
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
  });

  it("shows the owner wallet bookmark and a running total on a solo list", () => {
    act(() => {
      root.render(
        <ListsPanel
          initialLists={[{ ...solo, total_crc: "42.00" }]}
          currentUserId="owner-1"
        />,
      );
    });
    const card = container.querySelector('[aria-label="Open list: Personal"]');
    expect(card?.querySelector(".roleBookmark")?.querySelector("svg")).not.toBeNull();
    expect(card?.querySelector('[aria-label="Owner"]')).not.toBeNull();
    expect(chipTexts(card)).toEqual([]);
    const balanceCol = card?.querySelector(".cardBalanceCol");
    expect(balanceCol?.textContent).toContain(t.balanceTotal);
    expect(balanceCol?.textContent).toContain("₡42");
    expect(card?.textContent).not.toContain("sebas");
  });

  it("sorts aliases A–Z and colors only the owner chip", () => {
    act(() => {
      root.render(<ListsPanel initialLists={[shared]} currentUserId="owner-1" />);
    });
    const card = container.querySelector('[aria-label="Open list: Home"]');
    expect(chipTexts(card)).toEqual(["alex", "member-3…"]);
    const chips = Array.from(card?.querySelectorAll(".chipRow span") ?? []);
    const otherChip = chips.find((el) => el.textContent === "alex");
    expect(chips.every((el) => !el.className.includes("accent"))).toBe(true);
    expect(otherChip?.className).not.toContain("accent");
  });

  it("uses a users-icon bookmark and still shows the owner when the viewer is a member", () => {
    act(() => {
      root.render(
        <ListsPanel
          initialLists={[{ ...shared, role: "member" }]}
          currentUserId="member-2"
        />,
      );
    });
    const card = container.querySelector('[aria-label="Open list: Home"]');
    expect(card?.querySelector(".roleBookmark")?.querySelector("svg")).not.toBeNull();
    expect(card?.querySelector('[aria-label="Member"]')).not.toBeNull();
    expect(chipTexts(card)).toEqual(["member-3…", "sebas"]);
    const chips = Array.from(card?.querySelectorAll(".chipRow span") ?? []);
    const ownerChip = chips.find((el) => el.textContent === "sebas");
    expect(ownerChip?.className).toContain("accent");
    expect(chipTexts(card)).not.toContain("alex");
  });

  it("places a nonzero balance in the card middle, alongside the total", () => {
    act(() => {
      root.render(
        <ListsPanel
          initialLists={[{ ...shared, balance_crc: "-12.50", total_crc: "88.00" }]}
          currentUserId="owner-1"
        />,
      );
    });
    const card = container.querySelector('[aria-label="Open list: Home"]');
    const balanceCol = card?.querySelector(".cardBalanceCol");
    expect(balanceCol?.textContent).toContain(t.balanceOwe);
    expect(balanceCol?.textContent).toContain("₡12.5");
    expect(balanceCol?.textContent).toContain(t.balanceTotal);
    expect(balanceCol?.textContent).toContain("₡88");
  });

  it("shows only the total, with no owe/owed block, when a shared list is settled", () => {
    act(() => {
      root.render(
        <ListsPanel
          initialLists={[{ ...shared, balance_crc: "0", total_crc: "88.00" }]}
          currentUserId="owner-1"
        />,
      );
    });
    const card = container.querySelector('[aria-label="Open list: Home"]');
    const balanceCol = card?.querySelector(".cardBalanceCol");
    expect(balanceCol?.textContent).not.toContain(t.balanceOwe);
    expect(balanceCol?.textContent).not.toContain(t.balanceOwed);
    expect(balanceCol?.textContent).toContain(t.balanceTotal);
    expect(balanceCol?.textContent).toContain("₡88");
  });

  it("renders a help icon (on /home, since ListsPanel is the real Lists surface) that navigates to /docs#lists", () => {
    act(() => {
      root.render(
        <AppShell>
          <ListsPanel initialLists={[shared]} currentUserId="owner-1" />
        </AppShell>,
      );
    });
    const helpButton = container.querySelector(
      'button[aria-label="Learn more about Lists"]',
    ) as HTMLButtonElement;
    expect(helpButton).toBeTruthy();

    act(() => {
      helpButton.click();
    });
    expect(push).toHaveBeenCalledWith("/docs?from=%2Fhome#lists");
  });
});
