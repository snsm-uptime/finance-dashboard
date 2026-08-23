/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listsMessages } from "@/lib/i18n/lists";
import type { ListItem } from "./listsClient";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

import { ListsPanel } from "./ListsPanel";

const t = listsMessages.en;

const solo: ListItem = {
  id: "personal",
  name: "Personal",
  owner_id: "owner-1",
  role: "owner",
  balance_crc: "0",
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
  });

  it("uses an O bookmark and hides a settled-zero row on a solo list", () => {
    act(() => {
      root.render(<ListsPanel initialLists={[solo]} currentUserId="owner-1" />);
    });
    const card = container.querySelector('[aria-label="Open list: Personal"]');
    expect(card?.querySelector(".roleBookmark")?.textContent).toBe(t.ownedMark);
    expect(card?.querySelector('[aria-label="Owner"]')).not.toBeNull();
    expect(chipTexts(card)).toEqual([]);
    expect(card?.textContent).not.toContain("sebas");
    expect(card?.textContent).not.toContain(t.balanceZero);
  });

  it("sorts other members A–Z and never chips the owner", () => {
    act(() => {
      root.render(<ListsPanel initialLists={[shared]} currentUserId="owner-1" />);
    });
    const card = container.querySelector('[aria-label="Open list: Home"]');
    expect(chipTexts(card)).toEqual(["alex", "member-3…"]);
    expect(card?.textContent).not.toContain("sebas");
  });

  it("uses an M bookmark and chips other members, not the owner", () => {
    act(() => {
      root.render(
        <ListsPanel
          initialLists={[{ ...shared, role: "member" }]}
          currentUserId="member-2"
        />,
      );
    });
    const card = container.querySelector('[aria-label="Open list: Home"]');
    expect(card?.querySelector(".roleBookmark")?.textContent).toBe(t.memberMark);
    expect(card?.querySelector('[aria-label="Member"]')).not.toBeNull();
    expect(chipTexts(card)).toEqual(["member-3…"]);
    expect(card?.textContent).not.toContain("sebas");
    expect(card?.textContent).not.toContain("alex");
  });

  it("places a nonzero balance in the card middle", () => {
    act(() => {
      root.render(
        <ListsPanel
          initialLists={[{ ...solo, balance_crc: "-12.50" }]}
          currentUserId="owner-1"
        />,
      );
    });
    const card = container.querySelector('[aria-label="Open list: Personal"]');
    const middle = card?.querySelector(".cardMiddle");
    expect(middle?.textContent).toContain(t.balanceOwe);
    expect(middle?.textContent).toContain("₡12.5");
  });
});
