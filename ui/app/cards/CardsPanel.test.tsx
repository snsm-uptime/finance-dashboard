/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cardsMessages } from "@/lib/i18n/cards";
import type { CardItem } from "./cardsClient";
import type { ListItem } from "../lists/listsClient";

const fetchCards = vi.fn();
const fetchLists = vi.fn();

vi.mock("@/components/PreferencesProvider", () => ({
  usePreferences: () => ({ locale: "en" }),
}));

vi.mock("./cardsClient", async () => {
  const actual = await vi.importActual<typeof import("./cardsClient")>("./cardsClient");
  return {
    ...actual,
    fetchCards: (...args: unknown[]) => fetchCards(...args),
  };
});

vi.mock("../lists/listsClient", async () => {
  const actual = await vi.importActual<typeof import("../lists/listsClient")>(
    "../lists/listsClient",
  );
  return {
    ...actual,
    fetchLists: (...args: unknown[]) => fetchLists(...args),
  };
});

import { CardsPanel } from "./CardsPanel";
import { replaceMembershipLists, resetMembershipListsStore } from "../lists/membershipListsStore";

const t = cardsMessages.en;

const card: CardItem = {
  id: "card-1",
  label: "My Visa",
  iban: "CR05010200001123456789",
  created_at: "2026-08-01T00:00:00Z",
  routing_mode: "review",
  fixed_list_id: null,
};

const lists: ListItem[] = [
  { id: "list-1", name: "Household", owner_id: "u1", role: "owner" },
];

function classTokens(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean);
}

function headingTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("h2, h3"))
    .map((el) => el.textContent?.trim() ?? "")
    .filter(Boolean);
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

describe("CardsPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    fetchCards.mockReset();
    fetchLists.mockReset();
    fetchCards.mockResolvedValue({ ok: true, cards: [card] });
    fetchLists.mockResolvedValue({ ok: true, lists });
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

  it("keeps Register then list in source order", async () => {
    await act(async () => {
      root.render(<CardsPanel embedded />);
    });
    await waitForDom(() => container.textContent?.includes(card.label));

    const wrapper = container.firstElementChild as HTMLElement;
    expect(classTokens(wrapper)).toEqual(
      expect.arrayContaining(["flex", "flex-col", "md:flex-col-reverse", "md:justify-end", "gap-8"]),
    );
    expect(classTokens(wrapper)).not.toContain("flex-col-reverse");

    expect(wrapper.children).toHaveLength(2);
    expect(wrapper.children[0].getAttribute("aria-labelledby")).toMatch(/register-title$/);
    expect(wrapper.children[1].getAttribute("aria-labelledby")).toMatch(/list-title$/);
    expect(headingTexts(container)).toEqual([t.submit, t.listTitle]);
  });

  it("drops a deleted list from destination dropdowns without a remount", async () => {
    fetchCards.mockResolvedValue({
      ok: true,
      cards: [{ ...card, routing_mode: "fixed", fixed_list_id: "list-1" }],
    });
    fetchLists.mockResolvedValue({
      ok: true,
      lists: [
        { id: "list-1", name: "Household", owner_id: "u1", role: "owner" },
        { id: "list-2", name: "Trip", owner_id: "u1", role: "owner" },
      ],
    });
    await act(async () => {
      root.render(<CardsPanel embedded />);
    });
    await waitForDom(() => container.textContent?.includes(card.label));

    const chip = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.getAttribute("aria-label")?.startsWith(`${t.routingTitle}:`),
    ) as HTMLButtonElement;
    await act(async () => {
      chip.click();
    });
    await waitForDom(() => Boolean(container.querySelector('button[aria-haspopup="listbox"]')));

    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    await act(async () => {
      trigger.click();
    });
    expect(
      Array.from(container.querySelectorAll('[role="option"]')).map((el) => el.textContent),
    ).toEqual(["Household", "Trip"]);

    await act(async () => {
      replaceMembershipLists([{ id: "list-1", name: "Household", owner_id: "u1", role: "owner" }]);
    });
    expect(
      Array.from(container.querySelectorAll('[role="option"]')).map((el) => el.textContent),
    ).toEqual(["Household"]);
  });
});
