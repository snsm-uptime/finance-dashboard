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

  it("renders the register form above the card list, with no visible Cards heading", async () => {
    await act(async () => {
      root.render(<CardsPanel />);
    });
    await waitForDom(() => container.textContent?.includes(card.label));

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.tagName).toBe("SECTION");
    expect(wrapper.getAttribute("aria-label")).toBe(t.title);
    expect(headingTexts(container)).toEqual([]);

    const form = wrapper.querySelector("form") as HTMLFormElement;
    const list = wrapper.querySelector("ul") as HTMLUListElement;
    expect(form).not.toBeNull();
    expect(list).not.toBeNull();
    expect(
      form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("drops a deleted list from routing options without a remount", async () => {
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
      root.render(<CardsPanel />);
    });
    await waitForDom(() => container.textContent?.includes(card.label));

    const chip = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.getAttribute("aria-label")?.startsWith(`${t.routingTitle}:`),
    ) as HTMLButtonElement;
    await act(async () => {
      chip.click();
    });

    const tripOptionLabel = `${t.routingModeFixed}: Trip`;
    await waitForDom(() =>
      Array.from(container.querySelectorAll("button")).some(
        (btn) => btn.getAttribute("aria-label") === tripOptionLabel,
      ),
    );

    await act(async () => {
      replaceMembershipLists([{ id: "list-1", name: "Household", owner_id: "u1", role: "owner" }]);
    });
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (btn) => btn.getAttribute("aria-label") === tripOptionLabel,
      ),
    ).toBe(false);
  });
});
