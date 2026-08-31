/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CardRoutingControl } from "./CardRoutingControl";
import { cardsMessages } from "@/lib/i18n/cards";
import type { CardItem } from "./cardsClient";
import type { ListItem } from "../lists/listsClient";

const setCardRouting = vi.fn();

vi.mock("./cardsClient", async () => {
  const actual = await vi.importActual<typeof import("./cardsClient")>("./cardsClient");
  return {
    ...actual,
    setCardRouting: (...args: unknown[]) => setCardRouting(...args),
  };
});

const messages = {
  errorGeneric: cardsMessages.en.errorGeneric,
  errorUnauthorized: cardsMessages.en.errorUnauthorized,
  errorInvalidLabel: cardsMessages.en.errorInvalidLabel,
  errorInvalidIban: cardsMessages.en.errorInvalidIban,
  errorDuplicateIban: cardsMessages.en.errorDuplicateIban,
  errorForbidden: cardsMessages.en.errorForbidden,
  errorCardNotFound: cardsMessages.en.errorCardNotFound,
  routingTitle: cardsMessages.en.routingTitle,
  routingChipFixed: cardsMessages.en.routingChipFixed,
  routingChipReview: cardsMessages.en.routingChipReview,
  routingModeFixed: cardsMessages.en.routingModeFixed,
  routingModeReview: cardsMessages.en.routingModeReview,
  routingListLabel: cardsMessages.en.routingListLabel,
  routingSave: cardsMessages.en.routingSave,
  routingSaving: cardsMessages.en.routingSaving,
};

const card: CardItem = {
  id: "c1",
  label: "My Visa",
  iban: "CR05",
  created_at: "2026-08-14T00:00:00Z",
  routing_mode: "review",
  fixed_list_id: null,
};

const lists: ListItem[] = [
  { id: "list-1", name: "Household", owner_id: "u1", role: "owner" },
  { id: "list-2", name: "Trip", owner_id: "u1", role: "owner" },
];

function routingChip(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button[aria-controls]') as HTMLButtonElement;
}

function menuOption(container: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('[role="region"] button')).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;
}

async function expandRouting(container: HTMLElement) {
  const chip = routingChip(container);
  if (chip.getAttribute("aria-expanded") === "true") return;
  await act(async () => {
    chip.click();
  });
}

describe("CardRoutingControl", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onUpdated = vi.fn();

  beforeEach(() => {
    setCardRouting.mockReset();
    onUpdated.mockReset();
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

  it("renders a compact row with a Review chip and keeps the menu collapsed", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    const chip = routingChip(container);
    expect(container.textContent).toContain("My Visa");
    expect(chip.textContent).toContain(messages.routingChipReview);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector('[role="region"]')?.getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the fixed list's name for a card whose saved routing is fixed", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-1" };
    await act(async () => {
      root.render(
        <CardRoutingControl
          card={fixedCard}
          lists={lists}
          messages={messages}
          onUpdated={onUpdated}
        />,
      );
    });

    expect(routingChip(container).textContent).toContain("Household");
    expect(routingChip(container).getAttribute("aria-label")).toBe(
      `${messages.routingTitle}: Household`,
    );
  });

  it("falls back to the generic Fixed label when the saved list is gone", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-missing" };
    await act(async () => {
      root.render(
        <CardRoutingControl
          card={fixedCard}
          lists={lists}
          messages={messages}
          onUpdated={onUpdated}
        />,
      );
    });

    expect(routingChip(container).textContent).toContain(messages.routingChipFixed);
  });

  it("slides a menu of Review + list chips open, excluding the current setting", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);

    expect(routingChip(container).getAttribute("aria-expanded")).toBe("true");
    // Card is already in Review mode, so "Review" is not offered again.
    expect(menuOption(container, messages.routingChipReview)).toBeUndefined();
    expect(menuOption(container, "Household")).toBeTruthy();
    expect(menuOption(container, "Trip")).toBeTruthy();
  });

  it("clicking the card label does not open the menu", async () => {
    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    const label = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === "My Visa",
    ) as HTMLSpanElement;
    await act(async () => {
      label.click();
    });

    expect(routingChip(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("picking a list chip saves fixed routing to that list and collapses", async () => {
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...card, routing_mode: "fixed", fixed_list_id: "list-1" },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      menuOption(container, "Household").click();
    });

    expect(setCardRouting).toHaveBeenCalledWith(
      "c1",
      { routing_mode: "fixed", fixed_list_id: "list-1" },
      messages,
    );
    expect(onUpdated).toHaveBeenCalledWith({ ...card, routing_mode: "fixed", fixed_list_id: "list-1" });
    expect(routingChip(container).getAttribute("aria-expanded")).toBe("false");
  });

  it("picking the Review chip saves review routing and clears fixed_list_id", async () => {
    const fixedCard: CardItem = { ...card, routing_mode: "fixed", fixed_list_id: "list-1" };
    setCardRouting.mockResolvedValue({
      ok: true,
      card: { ...fixedCard, routing_mode: "review", fixed_list_id: null },
    });

    await act(async () => {
      root.render(
        <CardRoutingControl card={fixedCard} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      menuOption(container, messages.routingChipReview).click();
    });

    expect(setCardRouting).toHaveBeenCalledWith(
      "c1",
      { routing_mode: "review", fixed_list_id: null },
      messages,
    );
  });

  it("shows a 403 error via the error region and keeps the menu open", async () => {
    setCardRouting.mockResolvedValue({ ok: false, error: messages.errorForbidden });

    await act(async () => {
      root.render(
        <CardRoutingControl card={card} lists={lists} messages={messages} onUpdated={onUpdated} />,
      );
    });

    await expandRouting(container);
    await act(async () => {
      menuOption(container, "Trip").click();
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.errorForbidden);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(routingChip(container).getAttribute("aria-expanded")).toBe("true");
  });
});
